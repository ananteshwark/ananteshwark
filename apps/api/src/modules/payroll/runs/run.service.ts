import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  PayrollRun,
  PayrollRunStatus,
  PayrollRunType,
} from './entities/payroll-run.entity';
import {
  Payslip,
  PayslipStatus,
  PayslipLineItem,
} from './entities/payslip.entity';
import {
  Employee,
  EmployeeStatus,
} from '../../hr/employees/entities/employee.entity';
import { EmployeeSalary } from '../components/entities/employee-salary.entity';
import { PayComponentType } from '../components/entities/pay-component.entity';
import { ComponentService } from '../components/component.service';
import { StatutoryService } from '../statutory/statutory.service';
import { LocalizationRegistry } from '../../localization/localization.registry';
import { RetroPayrollService } from '../retro/retro-payroll.service';
import { GlService } from '../../finance/gl/gl.service';
import { PayrollGlService } from '../payroll-gl.service';
import { Account } from '../../finance/gl/entities/account.entity';
import { JournalSource } from '../../finance/gl/entities/journal-entry.entity';
import { DEFAULT_ACCOUNT_CODES } from '../../finance/finance.constants';
import { CreatePayrollRunDto } from './dto/run.dto';
import { AutomationService } from '../../automation/automation.service';
import {
  PaginationDto,
  PaginatedResponseDto,
} from '../../../common/dto/pagination.dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

@Injectable()
export class RunService {
  constructor(
    @InjectRepository(PayrollRun)
    private readonly runRepo: Repository<PayrollRun>,
    @InjectRepository(Payslip)
    private readonly payslipRepo: Repository<Payslip>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    private readonly componentService: ComponentService,
    private readonly statutoryService: StatutoryService,
    private readonly retroPayrollService: RetroPayrollService,
    private readonly glService: GlService,
    private readonly payrollGlService: PayrollGlService,
    private readonly dataSource: DataSource,
    @Optional() private readonly automation?: AutomationService,
    @Optional() private readonly localizationRegistry?: LocalizationRegistry,
  ) {}

  // ---------------------------------------------------------------------------
  // Run lifecycle
  // ---------------------------------------------------------------------------

  async createRun(tenantId: string, dto: CreatePayrollRunDto): Promise<PayrollRun> {
    const { payPeriodMonth, payPeriodYear } = dto;
    const periodStart = `${payPeriodYear}-${String(payPeriodMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(payPeriodYear, payPeriodMonth, 0).getDate();
    const periodEnd = `${payPeriodYear}-${String(payPeriodMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const payDate = dto.payDate ?? periodEnd;
    const runType = dto.runType ?? PayrollRunType.REGULAR;
    const name =
      dto.name ?? `${MONTH_NAMES[payPeriodMonth - 1]} ${payPeriodYear} Payroll`;

    // Guard against duplicate runs for the same period+type, which would
    // otherwise let payroll be processed and paid twice for one month.
    const duplicate = await this.runRepo.findOne({
      where: { tenantId, payPeriodYear, payPeriodMonth, runType },
    });
    if (duplicate) {
      throw new ConflictException(
        `A ${runType} payroll run for ${payPeriodMonth}/${payPeriodYear} already exists (${duplicate.status})`,
      );
    }

    const run = this.runRepo.create({
      tenantId,
      name,
      payPeriodMonth,
      payPeriodYear,
      periodStart,
      periodEnd,
      payDate,
      runType,
      currency: dto.currency || 'INR',
      status: PayrollRunStatus.DRAFT,
    });
    return this.runRepo.save(run);
  }

  async listRuns(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { status?: string },
  ): Promise<PaginatedResponseDto<PayrollRun>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.runRepo
      .createQueryBuilder('r')
      .where('r.tenantId = :tenantId', { tenantId });
    if (filters?.status) qb.andWhere('r.status = :status', { status: filters.status });
    qb.orderBy('r.payPeriodYear', 'DESC')
      .addOrderBy('r.payPeriodMonth', 'DESC')
      .addOrderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getRun(tenantId: string, id: string): Promise<PayrollRun> {
    const run = await this.runRepo.findOne({ where: { id, tenantId } });
    if (!run) throw new NotFoundException(`Payroll run ${id} not found`);
    return run;
  }

  async getRunWithPayslips(tenantId: string, id: string): Promise<any> {
    const run = await this.getRun(tenantId, id);
    const payslips = await this.payslipRepo.find({
      where: { payrollRunId: id, tenantId },
      order: { employeeCode: 'ASC' },
    });
    return { ...run, payslips };
  }

  // ---------------------------------------------------------------------------
  // THE CORE ENGINE
  // ---------------------------------------------------------------------------

  async processRun(
    tenantId: string,
    runId: string,
    _userId: string,
  ): Promise<PayrollRun> {
    const run = await this.getRun(tenantId, runId);
    if (run.status !== PayrollRunStatus.DRAFT && run.status !== PayrollRunStatus.PROCESSED) {
      throw new BadRequestException(
        `Cannot process a run in status ${run.status}`,
      );
    }

    const employees = await this.employeeRepo.find({
      where: { tenantId, status: EmployeeStatus.ACTIVE },
    });

    const daysInMonth = new Date(run.payPeriodYear, run.payPeriodMonth, 0).getDate();
    const isFebruary = run.payPeriodMonth === 2;

    const processed = await this.dataSource.transaction(async (manager) => {
      // wipe any existing payslips for re-processing
      await manager.delete(Payslip, { payrollRunId: runId, tenantId });

      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;
      let totalEmployerCost = 0;
      let employeeCount = 0;

      for (const emp of employees) {
        const salary = await this.componentService.getEmployeeSalary(
          tenantId,
          emp.id,
          run.periodEnd,
        );
        if (!salary || !salary.components?.length) continue;

        // LOP: simple model — assume full attendance (0 LOP). Hook for HR integration.
        const lopDays = 0;
        const daysWorked = daysInMonth - lopDays;
        const prorationFactor = daysInMonth > 0 ? daysWorked / daysInMonth : 1;

        const earnings: PayslipLineItem[] = [];
        let basic = 0;
        let gross = 0;
        for (const c of salary.components) {
          if (c.type !== PayComponentType.EARNING) continue;
          const amount = round2(c.amount * prorationFactor);
          if (c.code === 'BASIC') basic = amount;
          gross = round2(gross + amount);
          earnings.push({ code: c.code, name: c.name, amount });
        }

        // Statutory deductions — resolved by the employee's payroll country.
        // Non-India employees route through the localization pack registry
        // (US: federal brackets + FICA; AE: GPSSA + gratuity accrual); India
        // keeps the config-driven PF/ESI/PT/TDS path below.
        const deductions: PayslipLineItem[] = [];
        const employerContribs: PayslipLineItem[] = [];

        const payrollCountry = ((emp as any).payrollCountry || 'IN').toUpperCase();
        const countryPack = payrollCountry !== 'IN' ? this.localizationRegistry?.get(payrollCountry) : undefined;
        if (countryPack) {
          const statutory = countryPack.calculateStatutory({
            grossMonthly: gross,
            basicMonthly: basic,
            annualTaxableIncome: round2(gross * 12),
            country: payrollCountry,
          });
          for (const d of statutory.employeeDeductions) {
            if (d.amount > 0) deductions.push({ code: d.code, name: d.name, amount: round2(d.amount) });
          }
          for (const c of statutory.employerContributions) {
            if (c.amount > 0) employerContribs.push({ code: c.code, name: c.name, amount: round2(c.amount) });
          }
        } else {

        const pf = await this.statutoryService.calculatePF(tenantId, basic);
        if (pf.employee > 0) {
          deductions.push({ code: 'PF_EMPLOYEE', name: 'Provident Fund (Employee)', amount: pf.employee });
          employerContribs.push({ code: 'PF_EMPLOYER', name: 'Provident Fund (Employer)', amount: pf.employer });
        }

        const esi = await this.statutoryService.calculateESI(tenantId, gross);
        if (esi.employee > 0) {
          deductions.push({ code: 'ESI_EMPLOYEE', name: 'ESI (Employee)', amount: esi.employee });
          employerContribs.push({ code: 'ESI_EMPLOYER', name: 'ESI (Employer)', amount: esi.employer });
        }

        const pt = await this.statutoryService.calculatePT(tenantId, gross, isFebruary);
        if (pt > 0) {
          deductions.push({ code: 'PT', name: 'Professional Tax', amount: pt });
        }

        // TDS: annual projection = monthly gross * 12 (taxable earnings)
        const annualProjected = round2(gross * 12);
        const tds = await this.statutoryService.calculateTDS(tenantId, annualProjected);
        if (tds.monthly > 0) {
          deductions.push({ code: 'TDS', name: 'Income Tax (TDS)', amount: tds.monthly });
        }
        }

        const totalDed = round2(deductions.reduce((s, d) => s + d.amount, 0));
        const employerTotal = round2(employerContribs.reduce((s, d) => s + d.amount, 0));
        const netPay = round2(gross - totalDed);

        const payslip = manager.create(Payslip, {
          tenantId,
          payrollRunId: runId,
          employeeId: emp.id,
          employeeCode: emp.employeeCode,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          payPeriodMonth: run.payPeriodMonth,
          payPeriodYear: run.payPeriodYear,
          daysWorked,
          lopDays,
          grossEarnings: gross,
          totalDeductions: totalDed,
          netPay,
          employerContributions: employerTotal,
          status: PayslipStatus.GENERATED,
          earnings,
          deductions,
          employerContribs,
        });
        await manager.save(payslip);

        totalGross = round2(totalGross + gross);
        totalDeductions = round2(totalDeductions + totalDed);
        totalNet = round2(totalNet + netPay);
        totalEmployerCost = round2(totalEmployerCost + employerTotal);
        employeeCount += 1;
      }

      run.totalGross = totalGross;
      run.totalDeductions = totalDeductions;
      run.totalNet = totalNet;
      run.totalEmployerCost = totalEmployerCost;
      run.employeeCount = employeeCount;
      run.status = PayrollRunStatus.PROCESSED;
      run.processedAt = new Date();
      return manager.save(run);
    });

    await this.automation?.emit(tenantId, 'payroll.run.completed', { runId: processed.id, payPeriodYear: processed.payPeriodYear, payPeriodMonth: processed.payPeriodMonth, employeeCount: processed.employeeCount, totalNet: Number(processed.totalNet) });

    // Additively detect & attach retro-payroll arrears as ARREARS earning lines.
    // Best-effort: guarded so an arrears failure never breaks an existing run.
    try {
      await this.retroPayrollService.applyArrearsToRun(tenantId, runId);
      return await this.getRun(tenantId, runId);
    } catch {
      return processed;
    }
  }

  // ---------------------------------------------------------------------------
  // Approve — post accrual JE
  // ---------------------------------------------------------------------------

  private async resolveAccountId(
    tenantId: string,
    code: string,
    manager: any,
  ): Promise<string> {
    const account = await manager.findOne(Account, { where: { tenantId, code } });
    if (!account) {
      throw new BadRequestException(
        `GL account with code ${code} not found. Run the seed to create payroll accounts.`,
      );
    }
    return account.id;
  }

  async approveRun(
    tenantId: string,
    runId: string,
    userId: string,
  ): Promise<PayrollRun> {
    const run = await this.getRun(tenantId, runId);
    if (run.status !== PayrollRunStatus.PROCESSED && run.status !== PayrollRunStatus.DRAFT) {
      throw new BadRequestException(`Cannot approve a run in status ${run.status}`);
    }
    if (run.status === PayrollRunStatus.DRAFT) {
      throw new BadRequestException('Run must be processed before approval');
    }

    const payslips = await this.payslipRepo.find({
      where: { payrollRunId: runId, tenantId },
    });
    if (!payslips.length) {
      throw new BadRequestException('No payslips to post for this run');
    }

    const approved = await this.dataSource.transaction(async (manager) => {
      // Aggregate statutory deductions across all payslips
      let salaryExpense = 0; // gross earnings (employer's salary cost before deductions)
      let employerPf = 0;
      let employerEsi = 0;
      let pfEmployee = 0;
      let esiEmployee = 0;
      let pt = 0;
      let tds = 0;
      let netPay = 0;

      for (const ps of payslips) {
        salaryExpense = round2(salaryExpense + ps.grossEarnings);
        netPay = round2(netPay + ps.netPay);
        for (const d of ps.deductions) {
          if (d.code === 'PF_EMPLOYEE') pfEmployee = round2(pfEmployee + d.amount);
          else if (d.code === 'ESI_EMPLOYEE') esiEmployee = round2(esiEmployee + d.amount);
          else if (d.code === 'PT') pt = round2(pt + d.amount);
          else if (d.code === 'TDS') tds = round2(tds + d.amount);
        }
        for (const e of ps.employerContribs) {
          if (e.code === 'PF_EMPLOYER') employerPf = round2(employerPf + e.amount);
          else if (e.code === 'ESI_EMPLOYER') employerEsi = round2(employerEsi + e.amount);
        }
      }

      const lines: any[] = [];
      // Debits (expenses)
      if (salaryExpense > 0) {
        lines.push({
          accountId: await this.resolveAccountId(tenantId, DEFAULT_ACCOUNT_CODES.SALARY_EXPENSE, manager),
          debit: salaryExpense,
          credit: 0,
          description: 'Salaries & wages',
        });
      }
      if (employerPf > 0) {
        lines.push({
          accountId: await this.resolveAccountId(tenantId, DEFAULT_ACCOUNT_CODES.EMPLOYER_PF_EXPENSE, manager),
          debit: employerPf,
          credit: 0,
          description: 'Employer PF contribution',
        });
      }
      if (employerEsi > 0) {
        lines.push({
          accountId: await this.resolveAccountId(tenantId, DEFAULT_ACCOUNT_CODES.EMPLOYER_ESI_EXPENSE, manager),
          debit: employerEsi,
          credit: 0,
          description: 'Employer ESI contribution',
        });
      }
      // Credits (payables)
      const pfPayable = round2(pfEmployee + employerPf);
      const esiPayable = round2(esiEmployee + employerEsi);
      if (pfPayable > 0) {
        lines.push({
          accountId: await this.resolveAccountId(tenantId, DEFAULT_ACCOUNT_CODES.PF_PAYABLE, manager),
          debit: 0,
          credit: pfPayable,
          description: 'PF payable',
        });
      }
      if (esiPayable > 0) {
        lines.push({
          accountId: await this.resolveAccountId(tenantId, DEFAULT_ACCOUNT_CODES.ESI_PAYABLE, manager),
          debit: 0,
          credit: esiPayable,
          description: 'ESI payable',
        });
      }
      if (pt > 0) {
        lines.push({
          accountId: await this.resolveAccountId(tenantId, DEFAULT_ACCOUNT_CODES.PT_PAYABLE, manager),
          debit: 0,
          credit: pt,
          description: 'Professional tax payable',
        });
      }
      if (tds > 0) {
        lines.push({
          accountId: await this.resolveAccountId(tenantId, DEFAULT_ACCOUNT_CODES.TDS_PAYABLE, manager),
          debit: 0,
          credit: tds,
          description: 'TDS payable',
        });
      }
      if (netPay > 0) {
        lines.push({
          accountId: await this.resolveAccountId(tenantId, DEFAULT_ACCOUNT_CODES.SALARIES_PAYABLE, manager),
          debit: 0,
          credit: netPay,
          description: 'Net salaries payable',
        });
      }

      // Balance guard: debits = salaryExpense + employerPf + employerEsi
      //                credits = pfPayable + esiPayable + pt + tds + netPay
      // netPay = gross - (pfEmployee + esiEmployee + pt + tds)
      // => credits = employerPf + employerEsi + gross = debits. Balanced.

      const je = await this.glService.postJournalEntry(
        tenantId,
        {
          date: run.payDate,
          description: `Payroll accrual - ${run.name}`,
          reference: `PAYRUN-${run.id.slice(0, 8)}`,
          source: JournalSource.PAYROLL,
          currency: run.currency || 'INR',
          lines,
        },
        userId,
        manager,
      );

      run.journalEntryId = je.id;
      run.status = PayrollRunStatus.APPROVED;
      run.approvedById = userId;
      run.approvedAt = new Date();
      return manager.save(run);
    });

    // Additively post payroll to GL via configurable mappings (Phase 26).
    // Guarded so a mapping/posting failure never breaks approval.
    try {
      await this.payrollGlService.postPayrollToGl(tenantId, runId);
    } catch {
      // ignore — GL posting is best-effort and configurable
    }

    return approved;
  }

  // ---------------------------------------------------------------------------
  // Mark paid — post bank payment JE
  // ---------------------------------------------------------------------------

  async markPaid(
    tenantId: string,
    runId: string,
    userId: string,
  ): Promise<PayrollRun> {
    const run = await this.getRun(tenantId, runId);
    if (run.status !== PayrollRunStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED runs can be marked paid');
    }

    return this.dataSource.transaction(async (manager) => {
      const lines = [
        {
          accountId: await this.resolveAccountId(tenantId, DEFAULT_ACCOUNT_CODES.SALARIES_PAYABLE, manager),
          debit: run.totalNet,
          credit: 0,
          description: 'Clear net salaries payable',
        },
        {
          accountId: await this.resolveAccountId(tenantId, DEFAULT_ACCOUNT_CODES.BANK, manager),
          debit: 0,
          credit: run.totalNet,
          description: 'Salary disbursement',
        },
      ];

      const je = await this.glService.postJournalEntry(
        tenantId,
        {
          date: run.payDate,
          description: `Payroll payment - ${run.name}`,
          reference: `PAYRUN-${run.id.slice(0, 8)}`,
          source: JournalSource.PAYROLL,
          currency: run.currency || 'INR',
          lines,
        },
        userId,
        manager,
      );

      run.paymentJournalEntryId = je.id;
      run.status = PayrollRunStatus.PAID;
      await manager.update(
        Payslip,
        { payrollRunId: runId, tenantId },
        { status: PayslipStatus.PAID },
      );
      return manager.save(run);
    });
  }

  async cancelRun(tenantId: string, runId: string): Promise<PayrollRun> {
    const run = await this.getRun(tenantId, runId);
    if (run.status !== PayrollRunStatus.DRAFT && run.status !== PayrollRunStatus.PROCESSED) {
      throw new BadRequestException('Only DRAFT or PROCESSED runs can be cancelled');
    }
    return this.dataSource.transaction(async (manager) => {
      await manager.delete(Payslip, { payrollRunId: runId, tenantId });
      run.status = PayrollRunStatus.CANCELLED;
      run.employeeCount = 0;
      run.totalGross = 0;
      run.totalDeductions = 0;
      run.totalNet = 0;
      run.totalEmployerCost = 0;
      return manager.save(run);
    });
  }

  // ---------------------------------------------------------------------------
  // Payslips
  // ---------------------------------------------------------------------------

  async getPayslip(tenantId: string, payslipId: string): Promise<Payslip> {
    const ps = await this.payslipRepo.findOne({ where: { id: payslipId, tenantId } });
    if (!ps) throw new NotFoundException(`Payslip ${payslipId} not found`);
    return ps;
  }

  async listPayslips(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { payrollRunId?: string; employeeId?: string },
  ): Promise<PaginatedResponseDto<Payslip>> {
    const { page = 1, limit = 50 } = pagination;
    const qb = this.payslipRepo
      .createQueryBuilder('p')
      .where('p.tenantId = :tenantId', { tenantId });
    if (filters?.payrollRunId)
      qb.andWhere('p.payrollRunId = :runId', { runId: filters.payrollRunId });
    if (filters?.employeeId)
      qb.andWhere('p.employeeId = :empId', { empId: filters.employeeId });
    qb.orderBy('p.payPeriodYear', 'DESC')
      .addOrderBy('p.payPeriodMonth', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getEmployeePayslips(
    tenantId: string,
    employeeId: string,
  ): Promise<Payslip[]> {
    return this.payslipRepo.find({
      where: { tenantId, employeeId },
      order: { payPeriodYear: 'DESC', payPeriodMonth: 'DESC' },
    });
  }

  // ---------------------------------------------------------------------------
  // Bank file export (NEFT/RTGS CSV)
  // ---------------------------------------------------------------------------

  async generateBankFile(tenantId: string, runId: string): Promise<string> {
    const run = await this.getRun(tenantId, runId);
    if (![PayrollRunStatus.APPROVED, PayrollRunStatus.PAID].includes(run.status)) {
      throw new BadRequestException('Bank file can only be generated for APPROVED or PAID runs');
    }

    const payslips = await this.payslipRepo.find({ where: { tenantId, payrollRunId: runId } });
    const employees = await this.employeeRepo.find({
      where: { tenantId },
      select: ['id', 'firstName', 'lastName'],
    });
    const empMap = new Map(employees.map(e => [e.id, e]));

    const rows = ['EmployeeId,EmployeeName,NetPay,Currency'];
    for (const slip of payslips) {
      const emp = empMap.get(slip.employeeId);
      const name = emp ? `${emp.firstName} ${emp.lastName}` : slip.employeeId;
      rows.push(`${slip.employeeId},"${name}",${slip.netPay},${run.currency || 'INR'}`);
    }

    return rows.join('\n');
  }
}
