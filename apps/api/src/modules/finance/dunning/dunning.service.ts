import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { DunningLevel } from './entities/dunning-level.entity';
import { DunningRun, DunningRunStatus, DunningLetter } from './entities/dunning-run.entity';
import { PaymentPlan } from './entities/payment-plan.entity';
import { CreateDunningLevelDto, UpdateDunningLevelDto, RunDunningDto, CreatePaymentPlanDto } from './dto/dunning.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';
import { Invoice, InvoiceStatus } from '../ar/entities/invoice.entity';
import { Customer } from '../ar/entities/customer.entity';
import { CollectionsService } from '../collections/collections.service';
import { AutomationService } from '../../automation/automation.service';

@Injectable()
export class DunningService {
  constructor(
    @InjectRepository(DunningLevel) private readonly levelRepo: Repository<DunningLevel>,
    @InjectRepository(DunningRun) private readonly runRepo: Repository<DunningRun>,
    @InjectRepository(DunningLetter) private readonly letterRepo: Repository<DunningLetter>,
    @InjectRepository(PaymentPlan) private readonly planRepo: Repository<PaymentPlan>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    private readonly collectionsService: CollectionsService,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ---- Dunning Levels ----
  async listLevels(tenantId: string): Promise<DunningLevel[]> {
    return this.levelRepo.find({ where: { tenantId }, order: { levelNumber: 'ASC' } });
  }

  async createLevel(tenantId: string, dto: CreateDunningLevelDto): Promise<DunningLevel> {
    return this.levelRepo.save(this.levelRepo.create({ ...dto, tenantId }));
  }

  async updateLevel(tenantId: string, id: string, dto: UpdateDunningLevelDto): Promise<DunningLevel> {
    const level = await this.levelRepo.findOne({ where: { tenantId, id } });
    if (!level) throw new NotFoundException(`Dunning level ${id} not found`);
    Object.assign(level, dto);
    return this.levelRepo.save(level);
  }

  // ---- Dunning Run ----
  async runDunning(tenantId: string, dto: RunDunningDto): Promise<DunningRun> {
    const levels = await this.listLevels(tenantId);
    if (levels.length === 0) throw new BadRequestException('No dunning levels configured');

    const today = dto.runDate;
    // Fetch invoices that are SENT or PARTIAL (could have an outstanding balance)
    const allInvoices = await this.invoiceRepo.find({ where: { tenantId } });
    // Ph-111: invoices under active dispute are suspended from dunning
    const disputedIds = await this.collectionsService.getDisputedInvoiceIds(tenantId);
    const filteredOverdue = allInvoices.filter(inv =>
      [InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE].includes(inv.status) &&
      inv.dueDate < today &&
      inv.balanceDue > 0 &&
      !disputedIds.has(inv.id),
    );

    const run = await this.runRepo.save(
      this.runRepo.create({
        tenantId, runDate: dto.runDate, notes: dto.notes,
        status: DunningRunStatus.DRAFT, customerCount: 0, totalOverdue: 0,
      }),
    );

    // Group by customer
    const customerMap = new Map<string, { invoices: Invoice[]; totalDue: number; maxDaysOverdue: number }>();
    for (const inv of filteredOverdue) {
      if (!inv.customerId) continue;
      const dueDate = new Date(inv.dueDate);
      const todayDate = new Date(today);
      const daysOverdue = Math.floor((todayDate.getTime() - dueDate.getTime()) / 86400000);
      if (!customerMap.has(inv.customerId)) {
        customerMap.set(inv.customerId, { invoices: [], totalDue: 0, maxDaysOverdue: 0 });
      }
      const entry = customerMap.get(inv.customerId)!;
      entry.invoices.push(inv);
      entry.totalDue += inv.balanceDue;
      entry.maxDaysOverdue = Math.max(entry.maxDaysOverdue, daysOverdue);
    }

    let totalOverdue = 0;
    const letters: DunningLetter[] = [];

    for (const [customerId, data] of customerMap) {
      const applicableLevel = levels
        .filter(l => l.isActive && l.daysOverdueFrom <= data.maxDaysOverdue &&
          (l.daysOverdueTo === null || l.daysOverdueTo >= data.maxDaysOverdue))
        .sort((a, b) => b.levelNumber - a.levelNumber)[0];

      if (!applicableLevel) continue;

      const customer = await this.customerRepo.findOne({ where: { tenantId, id: customerId } });
      letters.push(this.letterRepo.create({
        tenantId,
        runId: run.id,
        customerId,
        customerName: customer?.name || customerId,
        dunningLevelId: applicableLevel.id,
        levelNumber: applicableLevel.levelNumber,
        overdueAmount: data.totalDue,
        invoiceIds: data.invoices.map(i => i.id),
        status: 'PENDING' as any,
      }));
      totalOverdue += data.totalDue;
    }

    await this.letterRepo.save(letters);
    run.customerCount = letters.length;
    run.totalOverdue = Math.round(totalOverdue * 100) / 100;
    return this.runRepo.save(run);
  }

  async sendDunningRun(tenantId: string, runId: string): Promise<DunningRun> {
    const run = await this.runRepo.findOne({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    if (run.status !== DunningRunStatus.DRAFT) throw new BadRequestException('Only DRAFT runs can be sent');
    const letters = await this.letterRepo.find({ where: { runId, tenantId } });
    for (const letter of letters) {
      letter.status = 'SENT' as any;
      letter.sentAt = new Date();
    }
    await this.letterRepo.save(letters);
    run.status = DunningRunStatus.SENT;
    const sent = await this.runRepo.save(run);
    await this.automation?.emit(tenantId, 'dunning.sent', { runId: sent.id, customerCount: sent.customerCount, totalOverdue: Number(sent.totalOverdue) });
    return sent;
  }

  async listRuns(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<DunningRun>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.runRepo.findAndCount({
      where: { tenantId }, order: { runDate: 'DESC' }, skip: (page - 1) * limit, take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getRunLetters(tenantId: string, runId: string): Promise<DunningLetter[]> {
    const run = await this.runRepo.findOne({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    return this.letterRepo.find({ where: { runId, tenantId } });
  }

  // ---- Payment Plans ----
  async createPaymentPlan(tenantId: string, dto: CreatePaymentPlanDto): Promise<PaymentPlan> {
    const totalAmount = dto.totalAmount;
    const installmentAmount = Math.round((totalAmount / dto.installments) * 100) / 100;
    const startDate = new Date(dto.startDate);
    const schedule: PaymentPlan['schedule'] = [];

    for (let i = 0; i < dto.installments; i++) {
      const dueDate = new Date(startDate);
      if (dto.frequency === 'WEEKLY') dueDate.setDate(dueDate.getDate() + 7 * i);
      else dueDate.setMonth(dueDate.getMonth() + i); // default MONTHLY
      schedule.push({
        dueDate: dueDate.toISOString().slice(0, 10),
        amount: i === dto.installments - 1
          ? Math.round((totalAmount - installmentAmount * (dto.installments - 1)) * 100) / 100
          : installmentAmount,
        paid: false,
      });
    }

    return this.planRepo.save(this.planRepo.create({ ...dto, tenantId, schedule, amountPaid: 0 }));
  }

  async listPaymentPlans(tenantId: string, customerId?: string): Promise<PaymentPlan[]> {
    const where: any = { tenantId };
    if (customerId) where.customerId = customerId;
    return this.planRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async recordInstallmentPaid(tenantId: string, planId: string, installmentIndex: number): Promise<PaymentPlan> {
    const plan = await this.planRepo.findOne({ where: { id: planId, tenantId } });
    if (!plan) throw new NotFoundException(`Payment plan ${planId} not found`);
    if (installmentIndex >= plan.schedule.length) throw new BadRequestException('Invalid installment index');
    const schedule = [...plan.schedule];
    schedule[installmentIndex] = { ...schedule[installmentIndex], paid: true };
    plan.schedule = schedule;
    plan.amountPaid = Math.round(schedule.filter(s => s.paid).reduce((sum, s) => sum + s.amount, 0) * 100) / 100;
    if (plan.amountPaid >= plan.totalAmount) plan.status = 'COMPLETED' as any;
    return this.planRepo.save(plan);
  }
}
