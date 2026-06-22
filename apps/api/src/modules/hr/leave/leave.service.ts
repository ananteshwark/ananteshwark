import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveType, AccrualType } from './entities/leave-type.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveApplication, LeaveApplicationStatus } from './entities/leave-application.entity';
import { LeaveAccrualLog, AccrualSource } from './entities/leave-accrual-log.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmailService } from '../../email/email.service';
import { CreateLeaveTypeDto, UpdateLeaveTypeDto, ApplyLeaveDto } from './dto/leave.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

@Injectable()
export class LeaveService {
  constructor(
    @InjectRepository(LeaveType)
    private readonly leaveTypeRepo: Repository<LeaveType>,
    @InjectRepository(LeaveBalance)
    private readonly balanceRepo: Repository<LeaveBalance>,
    @InjectRepository(LeaveApplication)
    private readonly applicationRepo: Repository<LeaveApplication>,
    @InjectRepository(LeaveAccrualLog)
    private readonly accrualLogRepo: Repository<LeaveAccrualLog>,
    @Optional()
    @InjectRepository(Employee)
    private readonly employeeRepo?: Repository<Employee>,
    @Optional()
    private readonly emailService?: EmailService,
  ) {}

  /** Fire-and-forget leave notification email; never throws. */
  private async notifyLeave(
    tenantId: string,
    application: LeaveApplication,
    code: 'LEAVE_APPROVED' | 'LEAVE_REJECTED',
    remarks?: string,
  ): Promise<void> {
    try {
      if (!this.emailService || !this.employeeRepo) return;
      const employee = await this.employeeRepo.findOne({
        where: { tenantId, id: application.employeeId },
      });
      if (!employee?.email) return;
      await this.emailService.sendEmail(tenantId, employee.email, code, {
        employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
        fromDate: application.fromDate,
        toDate: application.toDate,
        days: application.days,
        remarks: remarks ?? '',
      });
    } catch {
      // notifications must never break the leave workflow
    }
  }

  // ---- Leave Types ----
  async createLeaveType(tenantId: string, dto: CreateLeaveTypeDto): Promise<LeaveType> {
    const lt = this.leaveTypeRepo.create({ ...dto, tenantId });
    return this.leaveTypeRepo.save(lt);
  }

  async listLeaveTypes(tenantId: string): Promise<LeaveType[]> {
    return this.leaveTypeRepo.find({ where: { tenantId, isActive: true } });
  }

  async updateLeaveType(tenantId: string, id: string, dto: UpdateLeaveTypeDto): Promise<LeaveType> {
    const lt = await this.leaveTypeRepo.findOne({ where: { tenantId, id } });
    if (!lt) throw new NotFoundException(`Leave type ${id} not found`);
    Object.assign(lt, dto);
    return this.leaveTypeRepo.save(lt);
  }

  // ---- Leave Balance ----
  async getBalance(tenantId: string, employeeId: string, leaveYear?: number): Promise<any[]> {
    const year = leaveYear ?? new Date().getFullYear();
    const balances = await this.balanceRepo.find({ where: { tenantId, employeeId, leaveYear: year } });
    const leaveTypes = await this.leaveTypeRepo.find({ where: { tenantId, isActive: true } });

    return leaveTypes.map(lt => {
      const balance = balances.find(b => b.leaveTypeId === lt.id);
      const opening = Number(balance?.openingBalance ?? 0);
      const accrued = Number(balance?.accrued ?? 0);
      const taken = Number(balance?.taken ?? 0);
      const adjusted = Number(balance?.adjusted ?? 0);
      return {
        leaveType: lt,
        leaveYear: year,
        openingBalance: opening,
        accrued,
        taken,
        adjusted,
        closingBalance: opening + accrued - taken + adjusted,
      };
    });
  }

  async accrueLeave(tenantId: string, employeeId: string, leaveTypeId: string, units: number, date: string): Promise<LeaveBalance> {
    const leaveYear = new Date(date).getFullYear();
    let balance = await this.balanceRepo.findOne({ where: { tenantId, employeeId, leaveTypeId, leaveYear } });
    if (!balance) {
      balance = this.balanceRepo.create({ tenantId, employeeId, leaveTypeId, leaveYear });
      await this.balanceRepo.save(balance);
    }
    balance.accrued = Number(balance.accrued) + units;
    await this.balanceRepo.save(balance);

    const log = this.accrualLogRepo.create({ tenantId, employeeId, leaveTypeId, accrualDate: date, units, leaveYear, source: AccrualSource.SYSTEM });
    await this.accrualLogRepo.save(log);
    return balance;
  }

  async runMonthlyAccrual(tenantId: string): Promise<void> {
    const leaveTypes = await this.leaveTypeRepo.find({ where: { tenantId, isActive: true, accrualType: AccrualType.MONTHLY } });
    // In production, would query active employees; here we just process the leave types
    // This would be called by a cron job with actual employee list
    console.log(`Monthly accrual run for ${leaveTypes.length} leave types in tenant ${tenantId}`);
  }

  // ---- Leave Applications ----
  async applyLeave(tenantId: string, dto: ApplyLeaveDto): Promise<LeaveApplication> {
    const leaveYear = new Date(dto.fromDate).getFullYear();
    const balance = await this.balanceRepo.findOne({ where: { tenantId, employeeId: dto.employeeId, leaveTypeId: dto.leaveTypeId, leaveYear } });

    const availableBalance = balance
      ? Number(balance.openingBalance) + Number(balance.accrued) - Number(balance.taken) + Number(balance.adjusted)
      : 0;

    if (availableBalance < dto.days) {
      throw new BadRequestException(`Insufficient leave balance. Available: ${availableBalance}, Requested: ${dto.days}`);
    }

    // Check for conflicts
    const conflicts = await this.applicationRepo.createQueryBuilder('la')
      .where('la.tenantId = :tenantId', { tenantId })
      .andWhere('la.employeeId = :employeeId', { employeeId: dto.employeeId })
      .andWhere('la.status IN (:...statuses)', { statuses: [LeaveApplicationStatus.SUBMITTED, LeaveApplicationStatus.APPROVED] })
      .andWhere('la.fromDate <= :toDate AND la.toDate >= :fromDate', { fromDate: dto.fromDate, toDate: dto.toDate })
      .getMany();

    if (conflicts.length > 0) {
      throw new BadRequestException('Leave application conflicts with an existing application');
    }

    const application = this.applicationRepo.create({ ...dto, tenantId, status: LeaveApplicationStatus.SUBMITTED, appliedAt: new Date() });
    return this.applicationRepo.save(application);
  }

  async approveLeave(tenantId: string, id: string, reviewerId: string, remarks?: string): Promise<LeaveApplication> {
    const application = await this.applicationRepo.findOne({ where: { tenantId, id } });
    if (!application) throw new NotFoundException(`Leave application ${id} not found`);
    if (application.status !== LeaveApplicationStatus.SUBMITTED) {
      throw new BadRequestException(`Application is not in SUBMITTED status`);
    }

    // Deduct balance
    const leaveYear = new Date(application.fromDate).getFullYear();
    let balance = await this.balanceRepo.findOne({ where: { tenantId, employeeId: application.employeeId, leaveTypeId: application.leaveTypeId, leaveYear } });
    if (!balance) {
      balance = this.balanceRepo.create({ tenantId, employeeId: application.employeeId, leaveTypeId: application.leaveTypeId, leaveYear });
    }
    balance.taken = Number(balance.taken) + Number(application.days);
    await this.balanceRepo.save(balance);

    application.status = LeaveApplicationStatus.APPROVED;
    application.reviewedById = reviewerId;
    application.reviewedAt = new Date();
    application.reviewRemarks = remarks ?? null;
    const saved = await this.applicationRepo.save(application);
    await this.notifyLeave(tenantId, saved, 'LEAVE_APPROVED', remarks);
    return saved;
  }

  async rejectLeave(tenantId: string, id: string, reviewerId: string, remarks?: string): Promise<LeaveApplication> {
    const application = await this.applicationRepo.findOne({ where: { tenantId, id } });
    if (!application) throw new NotFoundException(`Leave application ${id} not found`);
    application.status = LeaveApplicationStatus.REJECTED;
    application.reviewedById = reviewerId;
    application.reviewedAt = new Date();
    application.reviewRemarks = remarks ?? null;
    const saved = await this.applicationRepo.save(application);
    await this.notifyLeave(tenantId, saved, 'LEAVE_REJECTED', remarks);
    return saved;
  }

  async cancelLeave(tenantId: string, id: string, employeeId: string): Promise<LeaveApplication> {
    const application = await this.applicationRepo.findOne({ where: { tenantId, id, employeeId } });
    if (!application) throw new NotFoundException(`Leave application ${id} not found`);

    // Refund balance if already APPROVED
    if (application.status === LeaveApplicationStatus.APPROVED) {
      const leaveYear = new Date(application.fromDate).getFullYear();
      const balance = await this.balanceRepo.findOne({ where: { tenantId, employeeId, leaveTypeId: application.leaveTypeId, leaveYear } });
      if (balance) {
        balance.taken = Math.max(0, Number(balance.taken) - Number(application.days));
        await this.balanceRepo.save(balance);
      }
    }

    application.status = LeaveApplicationStatus.CANCELLED;
    return this.applicationRepo.save(application);
  }

  async withdrawLeave(tenantId: string, id: string, employeeId: string): Promise<LeaveApplication> {
    const application = await this.applicationRepo.findOne({ where: { tenantId, id, employeeId } });
    if (!application) throw new NotFoundException(`Leave application ${id} not found`);
    if (application.status !== LeaveApplicationStatus.SUBMITTED) {
      throw new BadRequestException(`Only SUBMITTED applications can be withdrawn`);
    }
    application.status = LeaveApplicationStatus.WITHDRAWN;
    return this.applicationRepo.save(application);
  }

  async listApplications(tenantId: string, pagination: PaginationDto, filters?: { employeeId?: string; status?: string }): Promise<PaginatedResponseDto<LeaveApplication>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.applicationRepo.createQueryBuilder('la').where('la.tenantId = :tenantId', { tenantId });
    if (filters?.employeeId) qb.andWhere('la.employeeId = :eid', { eid: filters.employeeId });
    if (filters?.status) qb.andWhere('la.status = :status', { status: filters.status });
    qb.orderBy('la.appliedAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getLeaveCalendar(tenantId: string, month: number, year: number): Promise<LeaveApplication[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0);
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    return this.applicationRepo.createQueryBuilder('la')
      .where('la.tenantId = :tenantId', { tenantId })
      .andWhere('la.status = :status', { status: LeaveApplicationStatus.APPROVED })
      .andWhere('la.fromDate <= :endDate AND la.toDate >= :startDate', { startDate, endDate: endDateStr })
      .orderBy('la.fromDate', 'ASC')
      .getMany();
  }
}
