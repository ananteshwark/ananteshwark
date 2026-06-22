import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ExitRequest,
  ExitReason,
  ExitStatus,
} from './entities/exit-request.entity';
import {
  ExitChecklistItem,
  ChecklistItemStatus,
} from './entities/exit-checklist-item.entity';
import { FnfSettlement, FnfStatus } from './entities/fnf-settlement.entity';
import {
  Employee,
  EmployeeStatus,
} from '../employees/entities/employee.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const DEFAULT_CHECKLIST: { item: string; assignedDept: string }[] = [
  { item: 'IT assets return', assignedDept: 'IT' },
  { item: 'ID card return', assignedDept: 'Admin' },
  { item: 'Finance dues clearance', assignedDept: 'Finance' },
  { item: 'HR documents handover', assignedDept: 'HR' },
  { item: 'Manager NOC', assignedDept: 'Manager' },
];

@Injectable()
export class ExitService {
  constructor(
    @InjectRepository(ExitRequest)
    private readonly exitRepo: Repository<ExitRequest>,
    @InjectRepository(ExitChecklistItem)
    private readonly checklistRepo: Repository<ExitChecklistItem>,
    @InjectRepository(FnfSettlement)
    private readonly fnfRepo: Repository<FnfSettlement>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  async list(tenantId: string, status?: string): Promise<any[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    const exits = await this.exitRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      exits.map(async (e) => {
        const emp = await this.employeeRepo.findOne({
          where: { id: e.employeeId, tenantId },
        });
        return {
          ...e,
          employeeCode: emp?.employeeCode ?? '',
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : '',
        };
      }),
    );
  }

  async getOne(tenantId: string, id: string): Promise<any> {
    const exit = await this.exitRepo.findOne({ where: { id, tenantId } });
    if (!exit) throw new NotFoundException(`Exit request ${id} not found`);
    const checklist = await this.checklistRepo.find({
      where: { exitRequestId: id, tenantId },
      order: { createdAt: 'ASC' },
    });
    const fnf = await this.fnfRepo.findOne({
      where: { exitRequestId: id, tenantId },
    });
    const emp = await this.employeeRepo.findOne({
      where: { id: exit.employeeId, tenantId },
    });
    return {
      ...exit,
      employeeCode: emp?.employeeCode ?? '',
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : '',
      checklist,
      fnf: fnf ?? null,
    };
  }

  async create(
    tenantId: string,
    dto: {
      employeeId: string;
      lastWorkingDate: string;
      reason?: ExitReason;
      exitInterviewDate?: string | null;
      notes?: string | null;
      rehireEligible?: boolean | null;
    },
  ): Promise<any> {
    const emp = await this.employeeRepo.findOne({
      where: { id: dto.employeeId, tenantId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const exit = this.exitRepo.create({
      tenantId,
      employeeId: dto.employeeId,
      lastWorkingDate: dto.lastWorkingDate,
      reason: dto.reason ?? ExitReason.RESIGNATION,
      exitInterviewDate: dto.exitInterviewDate ?? null,
      notes: dto.notes ?? null,
      rehireEligible: dto.rehireEligible ?? null,
      status: ExitStatus.INITIATED,
    });
    const saved = await this.exitRepo.save(exit);

    // seed default checklist
    const items = DEFAULT_CHECKLIST.map((c) =>
      this.checklistRepo.create({
        tenantId,
        exitRequestId: saved.id,
        item: c.item,
        assignedDept: c.assignedDept,
        status: ChecklistItemStatus.PENDING,
      }),
    );
    await this.checklistRepo.save(items);

    return this.getOne(tenantId, saved.id);
  }

  async update(
    tenantId: string,
    id: string,
    dto: Partial<{
      lastWorkingDate: string;
      reason: ExitReason;
      exitInterviewDate: string | null;
      notes: string | null;
      rehireEligible: boolean | null;
      status: ExitStatus;
    }>,
  ): Promise<any> {
    const exit = await this.exitRepo.findOne({ where: { id, tenantId } });
    if (!exit) throw new NotFoundException(`Exit request ${id} not found`);
    Object.assign(exit, dto);
    await this.exitRepo.save(exit);

    // On COMPLETED, mark employee as leaving (status + dateOfLeaving) if applicable.
    if (dto.status === ExitStatus.COMPLETED) {
      const emp = await this.employeeRepo.findOne({
        where: { id: exit.employeeId, tenantId },
      });
      if (emp) {
        emp.dateOfLeaving = exit.lastWorkingDate;
        emp.status =
          exit.reason === ExitReason.TERMINATION
            ? EmployeeStatus.TERMINATED
            : EmployeeStatus.RESIGNED;
        await this.employeeRepo.save(emp);
      }
    }

    return this.getOne(tenantId, id);
  }

  async getChecklist(
    tenantId: string,
    exitRequestId: string,
  ): Promise<ExitChecklistItem[]> {
    return this.checklistRepo.find({
      where: { exitRequestId, tenantId },
      order: { createdAt: 'ASC' },
    });
  }

  async addChecklistItem(
    tenantId: string,
    exitRequestId: string,
    dto: { item: string; assignedDept?: string | null },
  ): Promise<ExitChecklistItem> {
    const exit = await this.exitRepo.findOne({
      where: { id: exitRequestId, tenantId },
    });
    if (!exit) throw new NotFoundException(`Exit request ${exitRequestId} not found`);
    const item = this.checklistRepo.create({
      tenantId,
      exitRequestId,
      item: dto.item,
      assignedDept: dto.assignedDept ?? null,
      status: ChecklistItemStatus.PENDING,
    });
    return this.checklistRepo.save(item);
  }

  async updateChecklistItem(
    tenantId: string,
    itemId: string,
    dto: { status: ChecklistItemStatus },
  ): Promise<any> {
    const item = await this.checklistRepo.findOne({
      where: { id: itemId, tenantId },
    });
    if (!item) throw new NotFoundException(`Checklist item ${itemId} not found`);
    item.status = dto.status;
    item.clearedAt =
      dto.status === ChecklistItemStatus.CLEARED ? new Date() : null;
    await this.checklistRepo.save(item);

    // Advance exit status to IN_CLEARANCE when any clearance work has started.
    const exit = await this.exitRepo.findOne({
      where: { id: item.exitRequestId, tenantId },
    });
    if (exit && exit.status === ExitStatus.INITIATED) {
      exit.status = ExitStatus.IN_CLEARANCE;
      await this.exitRepo.save(exit);
    }

    return item;
  }

  async computeFnf(
    tenantId: string,
    exitRequestId: string,
    dto: {
      pendingSalary?: number;
      leaveEncashment?: number;
      gratuity?: number;
      deductions?: number;
    },
  ): Promise<FnfSettlement> {
    const exit = await this.exitRepo.findOne({
      where: { id: exitRequestId, tenantId },
    });
    if (!exit) throw new NotFoundException(`Exit request ${exitRequestId} not found`);

    const pendingSalary = round2(dto.pendingSalary ?? 0);
    const leaveEncashment = round2(dto.leaveEncashment ?? 0);
    const gratuity = round2(dto.gratuity ?? 0);
    const deductions = round2(dto.deductions ?? 0);
    const netAmount = round2(
      pendingSalary + leaveEncashment + gratuity - deductions,
    );

    let fnf = await this.fnfRepo.findOne({
      where: { exitRequestId, tenantId },
    });
    if (fnf && fnf.status !== FnfStatus.DRAFT) {
      throw new BadRequestException(
        'F&F settlement is already approved/paid and cannot be recomputed',
      );
    }
    if (!fnf) {
      fnf = this.fnfRepo.create({
        tenantId,
        exitRequestId,
        status: FnfStatus.DRAFT,
      });
    }
    fnf.pendingSalary = pendingSalary;
    fnf.leaveEncashment = leaveEncashment;
    fnf.gratuity = gratuity;
    fnf.deductions = deductions;
    fnf.netAmount = netAmount;
    return this.fnfRepo.save(fnf);
  }

  async approveFnf(
    tenantId: string,
    exitRequestId: string,
  ): Promise<FnfSettlement> {
    const fnf = await this.fnfRepo.findOne({
      where: { exitRequestId, tenantId },
    });
    if (!fnf) throw new NotFoundException('F&F settlement not found');
    if (fnf.status !== FnfStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT F&F can be approved');
    }
    fnf.status = FnfStatus.APPROVED;
    await this.fnfRepo.save(fnf);

    // Move exit to SETTLED once F&F approved.
    const exit = await this.exitRepo.findOne({
      where: { id: exitRequestId, tenantId },
    });
    if (exit && exit.status !== ExitStatus.COMPLETED) {
      exit.status = ExitStatus.SETTLED;
      await this.exitRepo.save(exit);
    }
    return fnf;
  }

  async markFnfPaid(
    tenantId: string,
    exitRequestId: string,
  ): Promise<FnfSettlement> {
    const fnf = await this.fnfRepo.findOne({
      where: { exitRequestId, tenantId },
    });
    if (!fnf) throw new NotFoundException('F&F settlement not found');
    if (fnf.status !== FnfStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED F&F can be marked paid');
    }
    fnf.status = FnfStatus.PAID;
    return this.fnfRepo.save(fnf);
  }
}
