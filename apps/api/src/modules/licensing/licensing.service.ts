import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { LicensePlan, LicenseType } from './entities/license-plan.entity';
import { PricingTier } from './entities/pricing-tier.entity';
import { LicenseContract, ContractStatus, BillingCycle } from './entities/license-contract.entity';
import { ModuleLicense } from './entities/module-license.entity';
import { EmployeeModuleAssignment } from './entities/employee-module-assignment.entity';
import { ConsumptionRecord, ConsumptionType } from './entities/consumption-record.entity';
import { UsageSnapshot } from './entities/usage-snapshot.entity';
import { LicenseInvoice, InvoiceStatus } from './entities/license-invoice.entity';
import { InvoiceLineItem, LineItemType } from './entities/invoice-line-item.entity';
import { LicenseAuditLog } from './entities/license-audit-log.entity';
import {
  CreateLicensePlanDto,
  CreateLicenseContractDto,
  AssignModuleLicenseDto,
  UpdateModuleLicenseDto,
  AssignEmployeeModuleDto,
  BulkAssignEmployeeModuleDto,
  RecordConsumptionDto,
  GenerateInvoiceDto,
  ValidateAccessDto,
  UpdateContractStatusDto,
  UpdateInvoiceStatusDto,
  TakeSnapshotDto,
} from './dto/licensing.dto';
import { MODULE_CATALOG, MODULE_KEYS, LicensableModule } from './module-catalog';
import { LicenseEnforcementService } from './license-enforcement.service';

@Injectable()
export class LicensingService {
  constructor(
    @InjectRepository(LicensePlan)
    private readonly planRepo: Repository<LicensePlan>,

    @InjectRepository(PricingTier)
    private readonly pricingTierRepo: Repository<PricingTier>,

    @InjectRepository(LicenseContract)
    private readonly contractRepo: Repository<LicenseContract>,

    @InjectRepository(ModuleLicense)
    private readonly moduleLicenseRepo: Repository<ModuleLicense>,

    @InjectRepository(EmployeeModuleAssignment)
    private readonly assignmentRepo: Repository<EmployeeModuleAssignment>,

    @InjectRepository(ConsumptionRecord)
    private readonly consumptionRepo: Repository<ConsumptionRecord>,

    @InjectRepository(UsageSnapshot)
    private readonly snapshotRepo: Repository<UsageSnapshot>,

    @InjectRepository(LicenseInvoice)
    private readonly invoiceRepo: Repository<LicenseInvoice>,

    @InjectRepository(InvoiceLineItem)
    private readonly lineItemRepo: Repository<InvoiceLineItem>,

    @InjectRepository(LicenseAuditLog)
    private readonly auditLogRepo: Repository<LicenseAuditLog>,

    @Optional()
    private readonly enforcement?: LicenseEnforcementService,
  ) {}

  // ─── Module catalog ──────────────────────────────────────────────────────────

  /** Reject module keys that aren't in the server-side catalog. */
  private assertValidModuleKey(moduleKey: string): void {
    if (!MODULE_KEYS.has(moduleKey)) {
      throw new BadRequestException(
        `Unknown module key '${moduleKey}'. Valid keys: ${[...MODULE_KEYS].join(', ')}`,
      );
    }
  }

  /**
   * The catalog of licensable modules with each one's licensed state for the
   * tenant. When no module licenses are configured, entitlement is
   * unrestricted and every module reports as licensed.
   */
  async getCatalog(tenantId: string): Promise<{
    data: Array<LicensableModule & { licensed: boolean }>;
    total: number;
    entitlementConfigured: boolean;
  }> {
    const active = await this.moduleLicenseRepo.find({ where: { tenantId, isActive: true } });
    const configured = active.length > 0;
    const licensedKeys = new Set(active.map((m) => m.moduleKey));
    const data = MODULE_CATALOG.map((m) => ({
      ...m,
      licensed: !!m.core || !configured || licensedKeys.has(m.key),
    }));
    return { data, total: data.length, entitlementConfigured: configured };
  }

  // ─── Audit ───────────────────────────────────────────────────────────────────

  private async writeAuditLog(
    tenantId: string,
    eventType: string,
    entityType: string,
    entityId: string | null,
    userId: string | null,
    oldValue?: any,
    newValue?: any,
    notes?: string,
  ): Promise<void> {
    const log = this.auditLogRepo.create({
      tenantId,
      eventType,
      entityType,
      entityId,
      userId,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
      notes: notes ?? null,
    });
    await this.auditLogRepo.save(log);
  }

  // ─── Plans ───────────────────────────────────────────────────────────────────

  async listPlans(tenantId: string): Promise<{ data: LicensePlan[]; total: number }> {
    const data = await this.planRepo.find({
      where: [
        { tenantId: IsNull() },
        { tenantId },
      ],
      relations: ['tiers'],
      order: { createdAt: 'DESC' },
    });
    return { data, total: data.length };
  }

  async createPlan(tenantId: string, dto: CreateLicensePlanDto): Promise<LicensePlan> {
    const plan = this.planRepo.create({
      tenantId,
      name: dto.name,
      description: dto.description,
      licenseType: dto.licenseType,
    });
    const saved = await this.planRepo.save(plan);

    if (dto.tiers && dto.tiers.length > 0) {
      const tiers = dto.tiers.map((t) =>
        this.pricingTierRepo.create({
          planId: saved.id,
          tierName: t.tierName,
          minUnits: t.minUnits,
          maxUnits: t.maxUnits ?? null,
          unitPrice: t.unitPrice,
          flatFee: t.flatFee ?? 0,
        }),
      );
      await this.pricingTierRepo.save(tiers);
      saved.tiers = tiers;
    }

    await this.writeAuditLog(tenantId, 'PLAN_CREATED', 'LicensePlan', saved.id, null, null, saved);
    return saved;
  }

  // ─── Contracts ───────────────────────────────────────────────────────────────

  async listContracts(tenantId: string): Promise<{ data: LicenseContract[]; total: number }> {
    const data = await this.contractRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    return { data, total: data.length };
  }

  async getContract(tenantId: string, id: string): Promise<LicenseContract> {
    const contract = await this.contractRepo.findOne({ where: { id, tenantId } });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  async createContract(
    tenantId: string,
    dto: CreateLicenseContractDto,
    userId: string | null,
  ): Promise<LicenseContract> {
    // Auto-generate contract number
    const result = await this.contractRepo
      .createQueryBuilder('c')
      .select(
        "COALESCE(MAX(CAST(SUBSTRING(c.contractNumber FROM 10) AS INT)), 0)",
        'maxNum',
      )
      .where('c.tenantId = :tenantId', { tenantId })
      .getRawOne();
    const nextNum = (parseInt(result?.maxNum ?? '0', 10) || 0) + 1;
    const year = new Date().getFullYear();
    const contractNumber = `LIC-${year}-${String(nextNum).padStart(4, '0')}`;

    const contract = this.contractRepo.create({
      tenantId,
      contractNumber,
      planId: dto.planId ?? null,
      licenseType: dto.licenseType,
      billingCycle: dto.billingCycle,
      contractStartDate: dto.contractStartDate,
      contractEndDate: dto.contractEndDate,
      minCommitmentEmployees: dto.minCommitmentEmployees ?? 0,
      committedAmount: dto.committedAmount ?? null,
      consumptionPoolUnits: dto.consumptionPoolUnits ?? null,
      remainingUnits: dto.consumptionPoolUnits ?? null,
      currency: dto.currency ?? 'USD',
      paymentTerms: dto.paymentTerms ?? 'NET30',
      gracePeriodDays: dto.gracePeriodDays ?? 5,
      graceThresholdPct: dto.graceThresholdPct ?? 5,
      billingContactEmail: dto.billingContactEmail ?? null,
      status: ContractStatus.TRIAL,
    });

    const saved = await this.contractRepo.save(contract);
    await this.writeAuditLog(
      tenantId,
      'CONTRACT_CREATED',
      'LicenseContract',
      saved.id,
      userId,
      null,
      saved,
    );
    this.enforcement?.invalidate(tenantId);
    return saved;
  }

  async updateContractStatus(
    tenantId: string,
    id: string,
    dto: UpdateContractStatusDto,
    userId: string | null,
  ): Promise<LicenseContract> {
    const contract = await this.getContract(tenantId, id);
    const old = { status: contract.status };
    contract.status = dto.status;
    const saved = await this.contractRepo.save(contract);
    await this.writeAuditLog(
      tenantId,
      'CONTRACT_STATUS_UPDATED',
      'LicenseContract',
      id,
      userId,
      old,
      { status: dto.status },
    );
    this.enforcement?.invalidate(tenantId);
    return saved;
  }

  // ─── Module Licenses ─────────────────────────────────────────────────────────

  async listModuleLicenses(
    tenantId: string,
    contractId?: string,
  ): Promise<{ data: any[]; total: number }> {
    const where: any = { tenantId };
    if (contractId) where.contractId = contractId;
    const data = await this.moduleLicenseRepo.find({ where, order: { moduleKey: 'ASC' } });

    // Enrich each module license with current active-seat usage so the UI can
    // show "seats used / cap" and seats remaining.
    const enriched = await Promise.all(
      data.map(async (m) => {
        const assignedCount = await this.assignmentRepo.count({
          where: { tenantId, moduleKey: m.moduleKey, isActive: true },
        });
        const seatsRemaining =
          m.maxEmployees === null ? null : Math.max(0, m.maxEmployees - assignedCount);
        return { ...m, assignedCount, seatsRemaining };
      }),
    );

    return { data: enriched, total: enriched.length };
  }

  /**
   * Resolve the effective seat cap for a module across all active module
   * licenses for the tenant. Returns `null` when access is uncapped (i.e. at
   * least one active license grants unlimited seats), otherwise the summed cap.
   */
  private async getModuleSeatCap(tenantId: string, moduleKey: string): Promise<number | null> {
    const licenses = await this.moduleLicenseRepo.find({
      where: { tenantId, moduleKey, isActive: true },
    });
    if (licenses.length === 0) return null;
    let cap = 0;
    for (const lic of licenses) {
      if (lic.maxEmployees === null) return null; // any unlimited license ⇒ uncapped
      cap += lic.maxEmployees;
    }
    return cap;
  }

  async assignModuleLicense(
    tenantId: string,
    dto: AssignModuleLicenseDto,
    userId: string | null,
  ): Promise<ModuleLicense> {
    this.assertValidModuleKey(dto.moduleKey);
    const ml = this.moduleLicenseRepo.create({
      tenantId,
      contractId: dto.contractId,
      moduleKey: dto.moduleKey,
      moduleName: dto.moduleName,
      maxEmployees: dto.maxEmployees ?? null,
      unitPrice: dto.unitPrice,
      effectiveFrom: dto.effectiveFrom,
      effectiveTo: dto.effectiveTo ?? null,
      isActive: true,
    });
    const saved = await this.moduleLicenseRepo.save(ml);
    await this.writeAuditLog(
      tenantId,
      'MODULE_LICENSE_ASSIGNED',
      'ModuleLicense',
      saved.id,
      userId,
      null,
      saved,
    );
    this.enforcement?.invalidate(tenantId);
    return saved;
  }

  async updateModuleLicense(
    tenantId: string,
    id: string,
    dto: UpdateModuleLicenseDto,
    userId: string | null,
  ): Promise<ModuleLicense> {
    const ml = await this.moduleLicenseRepo.findOne({ where: { id, tenantId } });
    if (!ml) throw new NotFoundException('Module license not found');

    const old = { maxEmployees: ml.maxEmployees, unitPrice: ml.unitPrice, effectiveTo: ml.effectiveTo };

    if (dto.maxEmployees !== undefined) {
      // maxEmployees may be set to null to mean "unlimited".
      ml.maxEmployees = dto.maxEmployees === null ? null : dto.maxEmployees;
    }
    if (dto.unitPrice !== undefined) ml.unitPrice = dto.unitPrice;
    if (dto.effectiveTo !== undefined) ml.effectiveTo = dto.effectiveTo ?? null;

    const saved = await this.moduleLicenseRepo.save(ml);
    await this.writeAuditLog(
      tenantId,
      'MODULE_LICENSE_UPDATED',
      'ModuleLicense',
      id,
      userId,
      old,
      { maxEmployees: saved.maxEmployees, unitPrice: saved.unitPrice, effectiveTo: saved.effectiveTo },
    );
    this.enforcement?.invalidate(tenantId);
    return saved;
  }

  async revokeModuleLicense(
    tenantId: string,
    id: string,
    userId: string | null,
  ): Promise<ModuleLicense> {
    const ml = await this.moduleLicenseRepo.findOne({ where: { id, tenantId } });
    if (!ml) throw new NotFoundException('Module license not found');
    ml.isActive = false;
    const saved = await this.moduleLicenseRepo.save(ml);
    await this.writeAuditLog(
      tenantId,
      'MODULE_LICENSE_REVOKED',
      'ModuleLicense',
      id,
      userId,
      { isActive: true },
      { isActive: false },
    );
    this.enforcement?.invalidate(tenantId);
    return saved;
  }

  // ─── Employee Assignments ─────────────────────────────────────────────────────

  async listAssignments(
    tenantId: string,
    moduleKey?: string,
  ): Promise<{ data: EmployeeModuleAssignment[]; total: number }> {
    const where: any = { tenantId, isActive: true };
    if (moduleKey) where.moduleKey = moduleKey;
    const data = await this.assignmentRepo.find({
      where,
      order: { assignedAt: 'DESC' },
    });
    return { data, total: data.length };
  }

  async assignEmployee(
    tenantId: string,
    dto: AssignEmployeeModuleDto,
    userId: string | null,
  ): Promise<EmployeeModuleAssignment> {
    this.assertValidModuleKey(dto.moduleKey);
    // Check duplicate active assignment
    const existing = await this.assignmentRepo.findOne({
      where: {
        tenantId,
        employeeId: dto.employeeId,
        moduleKey: dto.moduleKey,
        isActive: true,
      },
    });
    if (existing) {
      throw new ConflictException(
        `Employee ${dto.employeeId} already has active assignment for module ${dto.moduleKey}`,
      );
    }

    // Enforce the per-module seat cap defined by the admin. Block the assignment
    // if granting it would exceed the number of licensed users for the module.
    const cap = await this.getModuleSeatCap(tenantId, dto.moduleKey);
    if (cap !== null) {
      const currentCount = await this.assignmentRepo.count({
        where: { tenantId, moduleKey: dto.moduleKey, isActive: true },
      });
      if (currentCount >= cap) {
        throw new BadRequestException(
          `Module '${dto.moduleKey}' seat limit reached (${currentCount}/${cap}). Increase the module's licensed users or revoke an existing assignment.`,
        );
      }
    }

    const assignment = this.assignmentRepo.create({
      tenantId,
      employeeId: dto.employeeId,
      employeeName: dto.employeeName,
      moduleKey: dto.moduleKey,
      assignedAt: new Date(),
      isActive: true,
    });
    const saved = await this.assignmentRepo.save(assignment);
    await this.writeAuditLog(
      tenantId,
      'EMPLOYEE_ASSIGNED',
      'EmployeeModuleAssignment',
      saved.id,
      userId,
      null,
      saved,
    );
    return saved;
  }

  async bulkAssignEmployees(
    tenantId: string,
    dto: BulkAssignEmployeeModuleDto,
    userId: string | null,
  ): Promise<{ assigned: number; skipped: number; capReached: number }> {
    this.assertValidModuleKey(dto.moduleKey);
    let assigned = 0;
    let skipped = 0;
    let capReached = 0;

    // Resolve the seat cap once and track a running active-seat count so we
    // stop assigning the moment the module's licensed-user limit is hit.
    const cap = await this.getModuleSeatCap(tenantId, dto.moduleKey);
    let activeCount =
      cap === null
        ? 0
        : await this.assignmentRepo.count({
            where: { tenantId, moduleKey: dto.moduleKey, isActive: true },
          });

    for (const emp of dto.employeeIds) {
      const existing = await this.assignmentRepo.findOne({
        where: {
          tenantId,
          employeeId: emp.employeeId,
          moduleKey: dto.moduleKey,
          isActive: true,
        },
      });
      if (existing) {
        skipped++;
        continue;
      }

      if (cap !== null && activeCount >= cap) {
        capReached++;
        continue;
      }

      const assignment = this.assignmentRepo.create({
        tenantId,
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        moduleKey: dto.moduleKey,
        assignedAt: new Date(),
        isActive: true,
      });
      await this.assignmentRepo.save(assignment);
      assigned++;
      activeCount++;
    }

    await this.writeAuditLog(
      tenantId,
      'BULK_EMPLOYEE_ASSIGNED',
      'EmployeeModuleAssignment',
      null,
      userId,
      null,
      { moduleKey: dto.moduleKey, assigned, skipped, capReached },
    );

    return { assigned, skipped, capReached };
  }

  async revokeAssignment(
    tenantId: string,
    id: string,
    userId: string | null,
  ): Promise<EmployeeModuleAssignment> {
    const assignment = await this.assignmentRepo.findOne({ where: { id, tenantId } });
    if (!assignment) throw new NotFoundException('Assignment not found');

    assignment.revokedAt = new Date();
    assignment.isActive = false;
    const saved = await this.assignmentRepo.save(assignment);

    await this.writeAuditLog(
      tenantId,
      'EMPLOYEE_REVOKED',
      'EmployeeModuleAssignment',
      id,
      userId,
      { isActive: true },
      { isActive: false, revokedAt: saved.revokedAt },
    );
    return saved;
  }

  // ─── Tiered Pricing ───────────────────────────────────────────────────────────

  applyTieredPricing(quantity: number, tiers: PricingTier[]): number {
    const sorted = [...tiers].sort((a, b) => a.minUnits - b.minUnits);
    let total = 0;
    let remaining = quantity;

    for (let i = 0; i < sorted.length; i++) {
      if (remaining <= 0) break;
      const tier = sorted[i];
      const nextTier = sorted[i + 1];
      const tierMax = tier.maxUnits !== null ? tier.maxUnits : Infinity;
      const tierMin = tier.minUnits;

      const tierCapacity = tierMax === Infinity ? remaining : Math.min(tierMax - tierMin + 1, remaining);
      const unitsInTier = Math.min(remaining, tierCapacity);

      if (unitsInTier > 0) {
        total += (tier.flatFee || 0) + unitsInTier * tier.unitPrice;
        remaining -= unitsInTier;
      }
    }

    return total;
  }

  // ─── Billing / Invoices ───────────────────────────────────────────────────────

  async calculateBill(
    tenantId: string,
    contractId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<{ lineItems: any[]; subtotal: number; breakdown: any }> {
    const contract = await this.getContract(tenantId, contractId);

    const lineItems: any[] = [];
    let subtotal = 0;

    if (contract.licenseType === LicenseType.EMPLOYEE_BASED) {
      // Get max active employees in period from consumption records
      const records = await this.consumptionRepo
        .createQueryBuilder('cr')
        .where('cr.tenantId = :tenantId', { tenantId })
        .andWhere('cr.recordDate >= :start', { start: periodStart })
        .andWhere('cr.recordDate <= :end', { end: periodEnd })
        .getMany();

      const employees =
        records.length > 0
          ? Math.max(...records.map((r) => r.activeEmployees))
          : contract.minCommitmentEmployees;

      const billableEmployees = Math.max(employees, contract.minCommitmentEmployees);

      let cost = 0;
      if (contract.planId) {
        const tiers = await this.pricingTierRepo.find({ where: { planId: contract.planId } });
        cost = this.applyTieredPricing(billableEmployees, tiers);
      } else {
        cost = billableEmployees * 10; // default $10/employee
      }

      lineItems.push({
        lineType: LineItemType.EMPLOYEE,
        description: `Employee-based license — ${billableEmployees} employees`,
        quantity: billableEmployees,
        unitPrice: cost / (billableEmployees || 1),
        amount: cost,
        moduleKey: null,
      });
      subtotal += cost;
    } else if (contract.licenseType === LicenseType.EMPLOYEE_PER_MODULE) {
      const modules = await this.moduleLicenseRepo.find({ where: { tenantId, contractId, isActive: true } });

      for (const mod of modules) {
        const assignmentCount = await this.assignmentRepo.count({
          where: { tenantId, moduleKey: mod.moduleKey, isActive: true },
        });
        const billable = Math.max(assignmentCount, 0);
        const cost = billable * mod.unitPrice;

        lineItems.push({
          lineType: LineItemType.MODULE,
          description: `${mod.moduleName} — ${billable} employees × $${mod.unitPrice}`,
          quantity: billable,
          unitPrice: mod.unitPrice,
          amount: cost,
          moduleKey: mod.moduleKey,
        });
        subtotal += cost;
      }
    } else if (contract.licenseType === LicenseType.ENTERPRISE_CONSUMPTION) {
      const records = await this.consumptionRepo
        .createQueryBuilder('cr')
        .where('cr.tenantId = :tenantId', { tenantId })
        .andWhere('cr.recordDate >= :start', { start: periodStart })
        .andWhere('cr.recordDate <= :end', { end: periodEnd })
        .getMany();

      const totalUnits = records.reduce((sum, r) => sum + (r.unitsConsumed || 0), 0);
      const totalCost = records.reduce((sum, r) => sum + (r.totalCost || 0), 0);

      lineItems.push({
        lineType: LineItemType.CONSUMPTION,
        description: `Enterprise consumption — ${totalUnits.toFixed(4)} units`,
        quantity: totalUnits,
        unitPrice: totalCost / (totalUnits || 1),
        amount: totalCost,
        moduleKey: null,
      });
      subtotal += totalCost;
    }

    return { lineItems, subtotal, breakdown: { licenseType: contract.licenseType } };
  }

  async generateInvoice(
    tenantId: string,
    dto: GenerateInvoiceDto,
    userId: string | null,
  ): Promise<LicenseInvoice> {
    const { lineItems, subtotal } = await this.calculateBill(
      tenantId,
      dto.contractId,
      dto.periodStart,
      dto.periodEnd,
    );

    // Auto-number invoice
    const result = await this.invoiceRepo
      .createQueryBuilder('i')
      .select("COALESCE(MAX(CAST(SUBSTRING(i.invoiceNumber FROM 10) AS INT)), 0)", 'maxNum')
      .where('i.tenantId = :tenantId', { tenantId })
      .getRawOne();
    const nextNum = (parseInt(result?.maxNum ?? '0', 10) || 0) + 1;
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-${year}-${String(nextNum).padStart(4, '0')}`;

    const taxRate = dto.taxRate ?? 0;
    const taxAmount = subtotal * (taxRate / 100);
    const totalAmount = subtotal + taxAmount;

    // Due date: 30 days from now
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const invoice = this.invoiceRepo.create({
      tenantId,
      contractId: dto.contractId,
      invoiceNumber,
      periodStart: dto.periodStart,
      periodEnd: dto.periodEnd,
      subtotal,
      taxAmount,
      discountAmount: 0,
      totalAmount,
      taxRate,
      status: InvoiceStatus.DRAFT,
      dueDate: dueDate.toISOString().slice(0, 10),
    });
    const savedInvoice = await this.invoiceRepo.save(invoice);

    // Create line items
    const items = lineItems.map((li) =>
      this.lineItemRepo.create({
        invoiceId: savedInvoice.id,
        description: li.description,
        lineType: li.lineType,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        amount: li.amount,
        moduleKey: li.moduleKey,
      }),
    );

    if (taxAmount > 0) {
      items.push(
        this.lineItemRepo.create({
          invoiceId: savedInvoice.id,
          description: `Tax (${taxRate}%)`,
          lineType: LineItemType.TAX,
          quantity: 1,
          unitPrice: taxAmount,
          amount: taxAmount,
          moduleKey: null,
        }),
      );
    }

    await this.lineItemRepo.save(items);
    savedInvoice.lineItems = items;

    await this.writeAuditLog(
      tenantId,
      'INVOICE_GENERATED',
      'LicenseInvoice',
      savedInvoice.id,
      userId,
      null,
      { invoiceNumber, totalAmount },
    );

    return savedInvoice;
  }

  async listInvoices(
    tenantId: string,
    contractId?: string,
  ): Promise<{ data: LicenseInvoice[]; total: number }> {
    const where: any = { tenantId };
    if (contractId) where.contractId = contractId;
    const data = await this.invoiceRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return { data, total: data.length };
  }

  async getInvoice(tenantId: string, id: string): Promise<LicenseInvoice> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, tenantId },
      relations: ['lineItems'],
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async updateInvoiceStatus(
    tenantId: string,
    id: string,
    dto: UpdateInvoiceStatusDto,
    userId: string | null,
  ): Promise<LicenseInvoice> {
    const invoice = await this.getInvoice(tenantId, id);
    const old = { status: invoice.status };
    invoice.status = dto.status;
    if (dto.status === InvoiceStatus.PAID) {
      invoice.paidAt = new Date();
    }
    const saved = await this.invoiceRepo.save(invoice);
    await this.writeAuditLog(
      tenantId,
      'INVOICE_STATUS_UPDATED',
      'LicenseInvoice',
      id,
      userId,
      old,
      { status: dto.status },
    );
    return saved;
  }

  // ─── Consumption ──────────────────────────────────────────────────────────────

  async recordConsumption(
    tenantId: string,
    dto: RecordConsumptionDto,
  ): Promise<ConsumptionRecord> {
    const totalCost = dto.unitsConsumed * dto.unitRate;
    const today = new Date().toISOString().slice(0, 10);

    const record = this.consumptionRepo.create({
      tenantId,
      periodMonth: dto.periodMonth,
      recordDate: today,
      consumptionType: dto.consumptionType,
      moduleKey: dto.moduleKey ?? null,
      activeEmployees: dto.activeEmployees,
      unitsConsumed: dto.unitsConsumed,
      unitRate: dto.unitRate,
      totalCost,
      notes: dto.notes ?? null,
    });
    const saved = await this.consumptionRepo.save(record);

    // Deduct from contract remaining units for enterprise
    if (dto.consumptionType === ConsumptionType.EMPLOYEE || dto.consumptionType === ConsumptionType.MODULE) {
      const contracts = await this.contractRepo.find({
        where: { tenantId, licenseType: LicenseType.ENTERPRISE_CONSUMPTION, status: ContractStatus.ACTIVE },
      });
      for (const contract of contracts) {
        if (contract.remainingUnits !== null) {
          contract.remainingUnits = Math.max(0, (contract.remainingUnits || 0) - dto.unitsConsumed);
          await this.contractRepo.save(contract);
        }
      }
    }

    return saved;
  }

  async getConsumptionHistory(
    tenantId: string,
    params: { periodMonth?: string; consumptionType?: string },
  ): Promise<{ data: ConsumptionRecord[]; total: number }> {
    const qb = this.consumptionRepo
      .createQueryBuilder('cr')
      .where('cr.tenantId = :tenantId', { tenantId })
      .orderBy('cr.recordDate', 'DESC');

    if (params.periodMonth) {
      qb.andWhere('cr.periodMonth = :periodMonth', { periodMonth: params.periodMonth });
    }
    if (params.consumptionType) {
      qb.andWhere('cr.consumptionType = :consumptionType', {
        consumptionType: params.consumptionType,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async takeSnapshot(tenantId: string, dto: TakeSnapshotDto): Promise<UsageSnapshot> {
    const { snapshotMonth } = dto;

    // Count active employee assignments per module
    const moduleRows = await this.assignmentRepo
      .createQueryBuilder('a')
      .select('a.moduleKey', 'moduleKey')
      .addSelect('COUNT(DISTINCT a.employeeId)', 'employeeCount')
      .where('a.tenantId = :tenantId', { tenantId })
      .andWhere('a.isActive = true')
      .groupBy('a.moduleKey')
      .getRawMany();

    const totalActiveEmployees = await this.assignmentRepo
      .createQueryBuilder('a')
      .select('COUNT(DISTINCT a.employeeId)', 'count')
      .where('a.tenantId = :tenantId', { tenantId })
      .andWhere('a.isActive = true')
      .getRawOne();

    const activeEmployees = parseInt(totalActiveEmployees?.count ?? '0', 10);

    const moduleUsage = moduleRows.map((row) => {
      const employeeCount = parseInt(row.employeeCount, 10);
      return {
        moduleKey: row.moduleKey,
        employeeCount,
        unitsConsumed: employeeCount * 0.5,
      };
    });

    const moduleUnits = moduleUsage.reduce((sum, m) => sum + m.unitsConsumed, 0);
    const totalUnits = activeEmployees + moduleUnits;

    // Get month consumption cost
    const consumptionResult = await this.consumptionRepo
      .createQueryBuilder('cr')
      .select('SUM(cr.totalCost)', 'totalCost')
      .where('cr.tenantId = :tenantId', { tenantId })
      .andWhere('cr.periodMonth = :month', { month: snapshotMonth })
      .getRawOne();
    const totalCost = parseFloat(consumptionResult?.totalCost ?? '0') || 0;

    // Get remaining units from active enterprise contract
    const enterprise = await this.contractRepo.findOne({
      where: {
        tenantId,
        licenseType: LicenseType.ENTERPRISE_CONSUMPTION,
        status: ContractStatus.ACTIVE,
      },
    });

    // Upsert snapshot
    let snapshot = await this.snapshotRepo.findOne({ where: { tenantId, snapshotMonth } });
    if (!snapshot) {
      snapshot = this.snapshotRepo.create({ tenantId, snapshotMonth });
    }
    snapshot.activeEmployees = activeEmployees;
    snapshot.moduleUsage = moduleUsage;
    snapshot.totalUnits = totalUnits;
    snapshot.totalCost = totalCost;
    snapshot.remainingUnits = enterprise?.remainingUnits ?? null;

    return this.snapshotRepo.save(snapshot);
  }

  async getSnapshot(tenantId: string, snapshotMonth: string): Promise<UsageSnapshot | null> {
    return this.snapshotRepo.findOne({ where: { tenantId, snapshotMonth } });
  }

  // ─── License Validation ───────────────────────────────────────────────────────

  async validateAccess(
    tenantId: string,
    dto: ValidateAccessDto,
  ): Promise<{ allowed: boolean; reason?: string; action: string }> {
    const today = new Date().toISOString().slice(0, 10);

    // Check active contract
    const contract = await this.contractRepo.findOne({
      where: { tenantId, status: ContractStatus.ACTIVE },
    });

    if (!contract) {
      // Check for any trial contract
      const trial = await this.contractRepo.findOne({ where: { tenantId, status: ContractStatus.TRIAL } });
      if (trial) {
        return { allowed: true, reason: 'Trial contract active', action: 'WARN' };
      }
      return { allowed: false, reason: 'No active contract', action: 'HARD_BLOCK' };
    }

    // Check contract end date
    if (contract.contractEndDate < today) {
      const expiredDate = new Date(contract.contractEndDate);
      const graceDue = new Date(expiredDate);
      graceDue.setDate(graceDue.getDate() + contract.gracePeriodDays);

      if (new Date() <= graceDue) {
        return {
          allowed: true,
          reason: `Contract expired — in grace period until ${graceDue.toISOString().slice(0, 10)}`,
          action: 'WARN',
        };
      }

      return { allowed: false, reason: 'Contract expired and grace period ended', action: 'HARD_BLOCK' };
    }

    // Module-specific checks
    if (dto.moduleKey) {
      const moduleLicense = await this.moduleLicenseRepo.findOne({
        where: { tenantId, moduleKey: dto.moduleKey, isActive: true },
      });

      if (!moduleLicense) {
        return {
          allowed: false,
          reason: `Module '${dto.moduleKey}' is not licensed`,
          action: 'SOFT_BLOCK',
        };
      }

      // Check employee assignment
      if (dto.employeeId) {
        const assignment = await this.assignmentRepo.findOne({
          where: {
            tenantId,
            employeeId: dto.employeeId,
            moduleKey: dto.moduleKey,
            isActive: true,
          },
        });

        if (!assignment) {
          return {
            allowed: false,
            reason: `Employee is not assigned to module '${dto.moduleKey}'`,
            action: 'SOFT_BLOCK',
          };
        }
      }

      // Check max employee capacity against the aggregate seat cap
      const cap = await this.getModuleSeatCap(tenantId, dto.moduleKey);
      if (cap !== null) {
        const currentCount = await this.assignmentRepo.count({
          where: { tenantId, moduleKey: dto.moduleKey, isActive: true },
        });
        if (currentCount > cap) {
          return {
            allowed: false,
            reason: `Module '${dto.moduleKey}' employee limit reached (${currentCount}/${cap})`,
            action: 'SOFT_BLOCK',
          };
        }
      }
    }

    // Enterprise: check remaining units
    if (contract.licenseType === LicenseType.ENTERPRISE_CONSUMPTION) {
      if (contract.remainingUnits !== null && contract.remainingUnits <= 0) {
        return {
          allowed: false,
          reason: 'Enterprise consumption pool exhausted',
          action: 'SOFT_BLOCK',
        };
      }

      const threshold = (contract.consumptionPoolUnits ?? 0) * ((contract.graceThresholdPct ?? 5) / 100);
      if (contract.remainingUnits !== null && contract.remainingUnits <= threshold) {
        return {
          allowed: true,
          reason: `Low consumption units remaining: ${contract.remainingUnits}`,
          action: 'WARN',
        };
      }
    }

    return { allowed: true, action: 'ALLOW' };
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string): Promise<any> {
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7);

    // Active contract
    const contract = await this.contractRepo.findOne({
      where: { tenantId, status: ContractStatus.ACTIVE },
    });

    // Employee counts
    const activeEmployeesResult = await this.assignmentRepo
      .createQueryBuilder('a')
      .select('COUNT(DISTINCT a.employeeId)', 'count')
      .where('a.tenantId = :tenantId', { tenantId })
      .andWhere('a.isActive = true')
      .getRawOne();
    const activeEmployees = parseInt(activeEmployeesResult?.count ?? '0', 10);

    const licensedEmployeesResult = await this.assignmentRepo.count({
      where: { tenantId, isActive: true },
    });

    // Modules count
    const modulesEnabled = await this.moduleLicenseRepo.count({
      where: { tenantId, isActive: true },
    });

    // Current month consumption
    const monthConsumption = await this.consumptionRepo
      .createQueryBuilder('cr')
      .select('SUM(cr.totalCost)', 'totalCost')
      .addSelect('SUM(cr.unitsConsumed)', 'totalUnits')
      .where('cr.tenantId = :tenantId', { tenantId })
      .andWhere('cr.periodMonth = :month', { month: currentMonth })
      .getRawOne();

    const monthlyCost = parseFloat(monthConsumption?.totalCost ?? '0') || 0;

    // License utilization
    const utilization =
      contract && contract.minCommitmentEmployees > 0
        ? Math.round((activeEmployees / contract.minCommitmentEmployees) * 100)
        : 0;

    // Remaining balance
    const remainingBalance = contract?.remainingUnits ?? null;

    // Days to expiry
    let daysToExpiry: number | null = null;
    if (contract) {
      const expiry = new Date(contract.contractEndDate);
      daysToExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Last 6 months snapshots
    const last6Months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today);
      d.setMonth(d.getMonth() - i);
      last6Months.push(d.toISOString().slice(0, 7));
    }

    const snapshots = await this.snapshotRepo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.snapshotMonth IN (:...months)', { months: last6Months })
      .orderBy('s.snapshotMonth', 'ASC')
      .getMany();

    return {
      contract,
      activeEmployees,
      licensedEmployees: licensedEmployeesResult,
      modulesEnabled,
      monthlyCost,
      remainingBalance,
      daysToExpiry,
      utilization,
      snapshots,
    };
  }

  // ─── Automated billing cycle ─────────────────────────────────────────────────

  /** First/last day of a month (1-based) as YYYY-MM-DD strings. */
  private static monthEdges(year: number, month1: number): { start: string; end: string } {
    const start = `${year}-${String(month1).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, month1, 0)).getUTCDate();
    const end = `${year}-${String(month1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }

  /**
   * The billing period an ACTIVE contract should be invoiced for once the
   * month before `asOf` has closed, or null when its cycle hasn't come due:
   * MONTHLY bills every month, QUARTERLY only after a calendar quarter closes,
   * ANNUAL only after December.
   */
  static billingPeriodFor(
    cycle: BillingCycle,
    asOf: Date,
  ): { periodStart: string; periodEnd: string; periodMonth: string } | null {
    let year = asOf.getUTCFullYear();
    let month1 = asOf.getUTCMonth(); // 0-based month index == previous month, 1-based
    if (month1 === 0) {
      month1 = 12;
      year -= 1;
    }
    const { start, end } = LicensingService.monthEdges(year, month1);
    const periodMonth = start.slice(0, 7);

    if (cycle === BillingCycle.MONTHLY) {
      return { periodStart: start, periodEnd: end, periodMonth };
    }
    if (cycle === BillingCycle.QUARTERLY) {
      if (month1 % 3 !== 0) return null; // only Mar/Jun/Sep/Dec close a quarter
      const { start: qStart } = LicensingService.monthEdges(year, month1 - 2);
      return { periodStart: qStart, periodEnd: end, periodMonth };
    }
    if (month1 !== 12) return null; // ANNUAL: only after December
    return { periodStart: `${year}-01-01`, periodEnd: end, periodMonth };
  }

  /**
   * Cross-tenant monthly billing sweep (called by the automation scheduler,
   * also invocable via the API). For every tenant with an ACTIVE contract it
   * upserts the previous month's usage snapshot, then generates an invoice
   * for each contract whose billing cycle has come due. Idempotent: an
   * existing invoice for the same contract and period is the dedupe, so the
   * hourly scheduler can call this freely.
   */
  async runMonthlyBillingCycle(asOf: Date = new Date()): Promise<{
    periodMonth: string;
    tenantsProcessed: number;
    snapshotsTaken: number;
    invoicesGenerated: number;
    invoices: Array<{
      tenantId: string;
      contractId: string;
      invoiceId: string;
      invoiceNumber: string;
      totalAmount: number;
      periodStart: string;
      periodEnd: string;
    }>;
  }> {
    const monthly = LicensingService.billingPeriodFor(BillingCycle.MONTHLY, asOf)!;
    const contracts = await this.contractRepo.find({ where: { status: ContractStatus.ACTIVE } });

    const tenants = [...new Set(contracts.map((c) => c.tenantId))];
    let snapshotsTaken = 0;
    for (const tenantId of tenants) {
      try {
        await this.takeSnapshot(tenantId, { snapshotMonth: monthly.periodMonth });
        snapshotsTaken++;
      } catch {
        // snapshot failure must not stop billing for other tenants
      }
    }

    const invoices: Array<{
      tenantId: string; contractId: string; invoiceId: string; invoiceNumber: string;
      totalAmount: number; periodStart: string; periodEnd: string;
    }> = [];
    for (const contract of contracts) {
      const period = LicensingService.billingPeriodFor(contract.billingCycle, asOf);
      if (!period) continue;
      if (contract.contractStartDate > period.periodEnd) continue; // started after the period
      const existing = await this.invoiceRepo.findOne({
        where: {
          tenantId: contract.tenantId,
          contractId: contract.id,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        },
      });
      if (existing) continue;
      try {
        const invoice = await this.generateInvoice(
          contract.tenantId,
          { contractId: contract.id, periodStart: period.periodStart, periodEnd: period.periodEnd },
          null,
        );
        invoices.push({
          tenantId: contract.tenantId,
          contractId: contract.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        });
      } catch {
        // one tenant's billing failure must not stop the sweep
      }
    }

    return {
      periodMonth: monthly.periodMonth,
      tenantsProcessed: tenants.length,
      snapshotsTaken,
      invoicesGenerated: invoices.length,
      invoices,
    };
  }
}
