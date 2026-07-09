import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveType, AccrualType, OccasionType } from './entities/leave-type.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveApplication, LeaveApplicationStatus } from './entities/leave-application.entity';
import { LeaveAccrualLog, AccrualSource } from './entities/leave-accrual-log.entity';
import { LeaveBlackout } from './entities/leave-blackout.entity';
import { LeaveEncashment, EncashmentStatus } from './entities/leave-encashment.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmailService } from '../../email/email.service';
import { AutomationService } from '../../automation/automation.service';
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
    @Optional()
    private readonly automation?: AutomationService,
    @Optional()
    @InjectRepository(LeaveBlackout)
    private readonly blackoutRepo?: Repository<LeaveBlackout>,
    @Optional()
    @InjectRepository(LeaveEncashment)
    private readonly encashmentRepo?: Repository<LeaveEncashment>,
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

  private availableOf(balance: LeaveBalance | null): number {
    if (!balance) return 0;
    return (
      Number(balance.openingBalance ?? 0) + Number(balance.accrued ?? 0)
      - Number(balance.taken ?? 0) + Number(balance.adjusted ?? 0)
    );
  }

  /** Inclusive calendar days between two yyyy-mm-dd dates. */
  private inclusiveDays(fromDate: string, toDate: string): number {
    const ms = new Date(toDate).getTime() - new Date(fromDate).getTime();
    return Math.round(ms / 86_400_000) + 1;
  }

  /** Run the leave-type policy gates; returns the effective days to book. */
  private async enforcePolicy(tenantId: string, dto: ApplyLeaveDto): Promise<{ days: number; hours: number | null }> {
    const leaveType = await this.leaveTypeRepo.findOne({ where: { tenantId, id: dto.leaveTypeId } });
    if (!leaveType) {
      // No configured type record → nothing to enforce (legacy data path).
      if (dto.hours != null) throw new BadRequestException('Hourly leave requires a configured leave type');
      return { days: Number(dto.days), hours: null };
    }

    // Hourly applications convert to day-fractions via the type's hoursPerDay.
    let days = Number(dto.days);
    let hours: number | null = null;
    if (dto.hours != null) {
      if (!leaveType.allowHourly) {
        throw new BadRequestException(`${leaveType.name} does not allow hourly applications`);
      }
      hours = Number(dto.hours);
      if (hours <= 0) throw new BadRequestException('hours must be positive');
      days = Math.round((hours / Number(leaveType.hoursPerDay || 8)) * 100) / 100;
    }

    // Past/future date windows relative to today.
    const today = new Date();
    const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const from = new Date(dto.fromDate);
    if (leaveType.maxBackdatedDays != null) {
      const daysBack = Math.floor((midnight.getTime() - from.getTime()) / 86_400_000);
      if (daysBack > leaveType.maxBackdatedDays) {
        throw new BadRequestException(`${leaveType.name} can be backdated at most ${leaveType.maxBackdatedDays} day(s)`);
      }
    }
    if (leaveType.maxAdvanceDays != null) {
      const daysAhead = Math.floor((from.getTime() - midnight.getTime()) / 86_400_000);
      if (daysAhead > leaveType.maxAdvanceDays) {
        throw new BadRequestException(`${leaveType.name} can be applied at most ${leaveType.maxAdvanceDays} day(s) in advance`);
      }
    }

    // Application-count limit for the leave year.
    if (leaveType.maxApplicationsPerYear != null) {
      const yearStart = `${new Date(dto.fromDate).getFullYear()}-01-01`;
      const yearEnd = `${new Date(dto.fromDate).getFullYear()}-12-31`;
      const used = await this.applicationRepo.createQueryBuilder('la')
        .where('la.tenantId = :tenantId', { tenantId })
        .andWhere('la.employeeId = :eid', { eid: dto.employeeId })
        .andWhere('la.leaveTypeId = :ltid', { ltid: dto.leaveTypeId })
        .andWhere('la.status IN (:...statuses)', { statuses: [LeaveApplicationStatus.SUBMITTED, LeaveApplicationStatus.APPROVED] })
        .andWhere('la.fromDate BETWEEN :ys AND :ye', { ys: yearStart, ye: yearEnd })
        .getCount();
      if (used >= leaveType.maxApplicationsPerYear) {
        throw new BadRequestException(`${leaveType.name} allows at most ${leaveType.maxApplicationsPerYear} application(s) per year`);
      }
    }

    // Interdependent usage: prerequisite type must be exhausted first.
    if (leaveType.requiresExhaustedTypeId) {
      const leaveYear = new Date(dto.fromDate).getFullYear();
      const prereqBalance = await this.balanceRepo.findOne({
        where: { tenantId, employeeId: dto.employeeId, leaveTypeId: leaveType.requiresExhaustedTypeId, leaveYear },
      });
      if (this.availableOf(prereqBalance) > 0) {
        const prereq = await this.leaveTypeRepo.findOne({ where: { tenantId, id: leaveType.requiresExhaustedTypeId } });
        throw new BadRequestException(
          `${leaveType.name} can only be used after ${prereq?.name ?? 'the prerequisite leave type'} is exhausted`,
        );
      }
    }

    // Blackout windows.
    if (this.blackoutRepo) {
      const blackout = await this.blackoutRepo.createQueryBuilder('b')
        .where('b.tenantId = :tenantId', { tenantId })
        .andWhere('b.isActive = true')
        .andWhere('b.fromDate <= :toDate AND b.toDate >= :fromDate', { fromDate: dto.fromDate, toDate: dto.toDate })
        .andWhere('(b.leaveTypeId IS NULL OR b.leaveTypeId = :ltid)', { ltid: dto.leaveTypeId })
        .getOne();
      if (blackout) {
        throw new BadRequestException(`Leave is blocked ${blackout.fromDate} to ${blackout.toDate}: ${blackout.name}`);
      }
    }

    // Sandwich rule: the full inclusive span (weekends included) is booked.
    if (leaveType.sandwichRule && !dto.halfDay && dto.hours == null) {
      const span = this.inclusiveDays(dto.fromDate, dto.toDate);
      if (span > days) days = span;
    }

    return { days, hours };
  }

  // ---- Leave Applications ----
  async applyLeave(tenantId: string, dto: ApplyLeaveDto): Promise<LeaveApplication> {
    const { days: effectiveDays, hours } = await this.enforcePolicy(tenantId, dto);
    dto = { ...dto, days: effectiveDays };

    const leaveYear = new Date(dto.fromDate).getFullYear();
    const balance = await this.balanceRepo.findOne({ where: { tenantId, employeeId: dto.employeeId, leaveTypeId: dto.leaveTypeId, leaveYear } });

    const availableBalance = this.availableOf(balance);
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

    const application = this.applicationRepo.create({ ...dto, hours, tenantId, status: LeaveApplicationStatus.SUBMITTED, appliedAt: new Date() });
    const saved = await this.applicationRepo.save(application);
    await this.automation?.emit(tenantId, 'leave.submitted', { applicationId: saved.id, employeeId: saved.employeeId, leaveTypeId: saved.leaveTypeId, fromDate: saved.fromDate, toDate: saved.toDate, days: saved.days });
    return saved;
  }

  async approveLeave(tenantId: string, id: string, reviewerId: string, remarks?: string): Promise<LeaveApplication> {
    const application = await this.applicationRepo.findOne({ where: { tenantId, id } });
    if (!application) throw new NotFoundException(`Leave application ${id} not found`);
    if (application.status !== LeaveApplicationStatus.SUBMITTED) {
      throw new BadRequestException(`Application is not in SUBMITTED status`);
    }

    // Deduct balance — re-check availability at approval time. The apply-time
    // check can be stale (two overlapping requests can each pass it), so we
    // re-validate here before committing the deduction.
    const leaveYear = new Date(application.fromDate).getFullYear();
    let balance = await this.balanceRepo.findOne({ where: { tenantId, employeeId: application.employeeId, leaveTypeId: application.leaveTypeId, leaveYear } });
    if (!balance) {
      balance = this.balanceRepo.create({ tenantId, employeeId: application.employeeId, leaveTypeId: application.leaveTypeId, leaveYear });
    }
    const available = Number(balance.openingBalance ?? 0) + Number(balance.accrued ?? 0)
      - Number(balance.taken ?? 0) + Number(balance.adjusted ?? 0);
    if (available < Number(application.days)) {
      throw new BadRequestException(
        `Insufficient leave balance to approve. Available: ${available}, Requested: ${application.days}`,
      );
    }
    balance.taken = Number(balance.taken) + Number(application.days);
    await this.balanceRepo.save(balance);

    application.status = LeaveApplicationStatus.APPROVED;
    application.reviewedById = reviewerId;
    application.reviewedAt = new Date();
    application.reviewRemarks = remarks ?? null;
    const saved = await this.applicationRepo.save(application);
    await this.notifyLeave(tenantId, saved, 'LEAVE_APPROVED', remarks);
    await this.automation?.emit(tenantId, 'leave.approved', { applicationId: saved.id, employeeId: saved.employeeId, days: saved.days, reviewedById: reviewerId });
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
    await this.automation?.emit(tenantId, 'leave.rejected', { applicationId: saved.id, employeeId: saved.employeeId, days: saved.days, reviewedById: reviewerId, remarks: remarks ?? null });
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

  // ---- Blackout windows ----
  async createBlackout(tenantId: string, dto: { name: string; fromDate: string; toDate: string; leaveTypeId?: string; reason?: string }): Promise<LeaveBlackout> {
    if (!this.blackoutRepo) throw new BadRequestException('Blackout policies are not available in this deployment');
    if (!dto.name?.trim() || !dto.fromDate || !dto.toDate) throw new BadRequestException('name, fromDate and toDate are required');
    if (dto.toDate < dto.fromDate) throw new BadRequestException('toDate must be on or after fromDate');
    return this.blackoutRepo.save(this.blackoutRepo.create({
      tenantId, name: dto.name.trim(), fromDate: dto.fromDate, toDate: dto.toDate,
      leaveTypeId: dto.leaveTypeId ?? null, reason: dto.reason ?? null,
    }));
  }

  async listBlackouts(tenantId: string): Promise<LeaveBlackout[]> {
    if (!this.blackoutRepo) return [];
    return this.blackoutRepo.find({ where: { tenantId, isActive: true }, order: { fromDate: 'ASC' } });
  }

  async deactivateBlackout(tenantId: string, id: string): Promise<LeaveBlackout> {
    if (!this.blackoutRepo) throw new BadRequestException('Blackout policies are not available in this deployment');
    const blackout = await this.blackoutRepo.findOne({ where: { tenantId, id } });
    if (!blackout) throw new NotFoundException(`Blackout ${id} not found`);
    blackout.isActive = false;
    return this.blackoutRepo.save(blackout);
  }

  // ---- Encashment ----
  async requestEncashment(tenantId: string, dto: { employeeId: string; leaveTypeId: string; units: number; leaveYear?: number }): Promise<LeaveEncashment> {
    if (!this.encashmentRepo) throw new BadRequestException('Encashment is not available in this deployment');
    const leaveType = await this.leaveTypeRepo.findOne({ where: { tenantId, id: dto.leaveTypeId } });
    if (!leaveType) throw new NotFoundException(`Leave type ${dto.leaveTypeId} not found`);
    if (!leaveType.isEncashable) throw new BadRequestException(`${leaveType.name} is not encashable`);
    const units = Number(dto.units);
    if (!(units > 0)) throw new BadRequestException('units must be positive');

    const leaveYear = dto.leaveYear ?? new Date().getFullYear();
    const balance = await this.balanceRepo.findOne({ where: { tenantId, employeeId: dto.employeeId, leaveTypeId: dto.leaveTypeId, leaveYear } });
    const available = this.availableOf(balance);
    if (available < units) {
      throw new BadRequestException(`Insufficient balance to encash. Available: ${available}, Requested: ${units}`);
    }
    return this.encashmentRepo.save(this.encashmentRepo.create({
      tenantId, employeeId: dto.employeeId, leaveTypeId: dto.leaveTypeId, leaveYear, units,
      status: EncashmentStatus.REQUESTED,
    }));
  }

  async approveEncashment(tenantId: string, id: string, reviewerId: string, remarks?: string): Promise<LeaveEncashment> {
    if (!this.encashmentRepo) throw new BadRequestException('Encashment is not available in this deployment');
    const request = await this.encashmentRepo.findOne({ where: { tenantId, id } });
    if (!request) throw new NotFoundException(`Encashment ${id} not found`);
    if (request.status !== EncashmentStatus.REQUESTED) {
      throw new BadRequestException(`Only REQUESTED encashments can be approved (current: ${request.status})`);
    }

    // Re-check and deduct at approval time (apply-time check can be stale).
    let balance = await this.balanceRepo.findOne({
      where: { tenantId, employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, leaveYear: request.leaveYear },
    });
    if (!balance) {
      balance = this.balanceRepo.create({ tenantId, employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, leaveYear: request.leaveYear });
    }
    if (this.availableOf(balance) < Number(request.units)) {
      throw new BadRequestException('Insufficient balance to approve this encashment');
    }
    balance.adjusted = Number(balance.adjusted ?? 0) - Number(request.units);
    await this.balanceRepo.save(balance);
    await this.accrualLogRepo.save(this.accrualLogRepo.create({
      tenantId, employeeId: request.employeeId, leaveTypeId: request.leaveTypeId,
      accrualDate: new Date().toISOString().slice(0, 10), units: -Number(request.units),
      leaveYear: request.leaveYear, source: AccrualSource.ENCASHMENT,
    }));

    request.status = EncashmentStatus.APPROVED;
    request.reviewedById = reviewerId;
    request.reviewedAt = new Date();
    request.remarks = remarks ?? null;
    const saved = await this.encashmentRepo.save(request);
    await this.automation?.emit(tenantId, 'leave.encashed', {
      encashmentId: saved.id, employeeId: saved.employeeId, leaveTypeId: saved.leaveTypeId,
      units: Number(saved.units), leaveYear: saved.leaveYear,
    });
    return saved;
  }

  async rejectEncashment(tenantId: string, id: string, reviewerId: string, remarks?: string): Promise<LeaveEncashment> {
    if (!this.encashmentRepo) throw new BadRequestException('Encashment is not available in this deployment');
    const request = await this.encashmentRepo.findOne({ where: { tenantId, id } });
    if (!request) throw new NotFoundException(`Encashment ${id} not found`);
    if (request.status !== EncashmentStatus.REQUESTED) {
      throw new BadRequestException(`Only REQUESTED encashments can be rejected (current: ${request.status})`);
    }
    request.status = EncashmentStatus.REJECTED;
    request.reviewedById = reviewerId;
    request.reviewedAt = new Date();
    request.remarks = remarks ?? null;
    return this.encashmentRepo.save(request);
  }

  async listEncashments(tenantId: string, employeeId?: string): Promise<LeaveEncashment[]> {
    if (!this.encashmentRepo) return [];
    const where: any = { tenantId };
    if (employeeId) where.employeeId = employeeId;
    return this.encashmentRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  // ---- Occasion auto-grants (birthday / joining anniversary) ----
  /**
   * Daily sweep: grants one unit of each occasion leave type to employees
   * whose birthday / joining anniversary falls today. Idempotent per year —
   * an existing OCCASION accrual for the type+year skips the grant.
   */
  async grantOccasionLeaves(tenantId: string, asOf?: string): Promise<{ granted: number }> {
    if (!this.employeeRepo) return { granted: 0 };
    const occasionTypes = await this.leaveTypeRepo.createQueryBuilder('lt')
      .where('lt.tenantId = :tenantId', { tenantId })
      .andWhere('lt.isActive = true')
      .andWhere('lt.occasionType IS NOT NULL')
      .getMany();
    if (!occasionTypes.length) return { granted: 0 };

    const today = asOf ?? new Date().toISOString().slice(0, 10);
    const [, month, day] = today.split('-');
    const leaveYear = Number(today.slice(0, 4));
    const employees = await this.employeeRepo.find({ where: { tenantId, status: 'ACTIVE' } as any });

    let granted = 0;
    for (const lt of occasionTypes) {
      const units = Number(lt.accrualRate) > 0 ? Number(lt.accrualRate) : 1;
      for (const emp of employees) {
        const anchor = lt.occasionType === OccasionType.BIRTHDAY ? emp.dateOfBirth : emp.dateOfJoining;
        if (!anchor || anchor.slice(5, 7) !== month || anchor.slice(8, 10) !== day) continue;
        // Anniversary grants only from the first anniversary onward.
        if (lt.occasionType === OccasionType.ANNIVERSARY && anchor.slice(0, 4) === String(leaveYear)) continue;

        const already = await this.accrualLogRepo.findOne({
          where: { tenantId, employeeId: emp.id, leaveTypeId: lt.id, leaveYear, source: AccrualSource.OCCASION },
        });
        if (already) continue;

        let balance = await this.balanceRepo.findOne({ where: { tenantId, employeeId: emp.id, leaveTypeId: lt.id, leaveYear } });
        if (!balance) {
          balance = this.balanceRepo.create({ tenantId, employeeId: emp.id, leaveTypeId: lt.id, leaveYear });
        }
        balance.accrued = Number(balance.accrued ?? 0) + units;
        await this.balanceRepo.save(balance);
        await this.accrualLogRepo.save(this.accrualLogRepo.create({
          tenantId, employeeId: emp.id, leaveTypeId: lt.id, accrualDate: today,
          units, leaveYear, source: AccrualSource.OCCASION,
        }));
        granted += 1;
      }
    }
    return { granted };
  }
}
