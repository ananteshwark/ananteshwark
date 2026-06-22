import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ArrearsRecord,
  ArrearsStatus,
} from './entities/arrears-record.entity';
import { EmployeeSalary } from '../components/entities/employee-salary.entity';
import { PayComponentType } from '../components/entities/pay-component.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { PayrollRun } from '../runs/entities/payroll-run.entity';
import { Payslip, PayslipLineItem } from '../runs/entities/payslip.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ArrearsPreviewRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  fromPeriod: string;
  toPeriod: string;
  affectedMonths: number;
  oldMonthlyGross: number;
  newMonthlyGross: number;
  monthlyDifference: number;
  arrears: number;
}

@Injectable()
export class RetroPayrollService {
  constructor(
    @InjectRepository(ArrearsRecord)
    private readonly arrearsRepo: Repository<ArrearsRecord>,
    @InjectRepository(EmployeeSalary)
    private readonly salaryRepo: Repository<EmployeeSalary>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(PayrollRun)
    private readonly runRepo: Repository<PayrollRun>,
    @InjectRepository(Payslip)
    private readonly payslipRepo: Repository<Payslip>,
  ) {}

  private monthlyGross(salary: EmployeeSalary): number {
    const comps = salary.components ?? [];
    if (comps.length) {
      return round2(
        comps
          .filter((c) => c.type === PayComponentType.EARNING)
          .reduce((s, c) => s + (c.amount ?? 0), 0),
      );
    }
    // fallback to CTC/12 if no resolved components
    return round2((salary.ctc ?? 0) / 12);
  }

  private periodStr(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  // number of full month-periods from `from` (inclusive) up to but EXCLUDING `until`
  private monthsBetween(
    fromYear: number,
    fromMonth: number,
    untilYear: number,
    untilMonth: number,
  ): number {
    return (untilYear - fromYear) * 12 + (untilMonth - fromMonth);
  }

  /**
   * Detect salary arrears that should be paid out in the run for {month}/{year}.
   *
   * A salary change qualifies when its effectiveFrom falls in a PRIOR period
   * (before the current run period) AND the affected past months were already
   * paid at the previous (lower/different) salary. Arrears is the per-month
   * gross difference multiplied by the number of affected past months.
   */
  async detectArrears(
    tenantId: string,
    month: number,
    year: number,
  ): Promise<ArrearsPreviewRow[]> {
    const currentPeriod = this.periodStr(year, month);
    const periodFirstDay = `${currentPeriod}-01`;

    // Active salaries whose effectiveFrom is strictly before the current period.
    const salaries = await this.salaryRepo.find({
      where: { tenantId },
      order: { employeeId: 'ASC', effectiveFrom: 'ASC' },
    });

    // group salaries by employee, keep chronological order
    const byEmployee = new Map<string, EmployeeSalary[]>();
    for (const s of salaries) {
      const arr = byEmployee.get(s.employeeId) ?? [];
      arr.push(s);
      byEmployee.set(s.employeeId, arr);
    }

    const rows: ArrearsPreviewRow[] = [];

    for (const [employeeId, list] of byEmployee.entries()) {
      // salaries effective on or before the run period start
      const applicable = list.filter((s) => s.effectiveFrom <= periodFirstDay);
      if (applicable.length < 2) continue;

      // the latest salary change
      const newest = applicable[applicable.length - 1];
      const prior = applicable[applicable.length - 2];

      const ef = new Date(newest.effectiveFrom);
      const efYear = ef.getUTCFullYear();
      const efMonth = ef.getUTCMonth() + 1;
      const effPeriod = this.periodStr(efYear, efMonth);

      // change must take effect in a PRIOR period (not the current run month, not future)
      if (effPeriod >= currentPeriod) continue;

      // affected past months: from effective month up to (but excluding) current run month
      const affectedMonths = this.monthsBetween(efYear, efMonth, year, month);
      if (affectedMonths <= 0) continue;

      const newMonthly = this.monthlyGross(newest);
      const oldMonthly = this.monthlyGross(prior);
      const diff = round2(newMonthly - oldMonthly);
      if (diff === 0) continue;

      // skip if already applied for this period (record covering these periods + APPLIED)
      const toPeriodEnd = this.periodStr(
        month === 1 ? year - 1 : year,
        month === 1 ? 12 : month - 1,
      );
      const existing = await this.arrearsRepo.findOne({
        where: {
          tenantId,
          employeeId,
          fromPeriod: effPeriod,
          toPeriod: toPeriodEnd,
          status: ArrearsStatus.APPLIED,
        },
      });
      if (existing) continue;

      const emp = await this.employeeRepo.findOne({
        where: { id: employeeId, tenantId },
      });

      rows.push({
        employeeId,
        employeeCode: emp?.employeeCode ?? '',
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : '',
        fromPeriod: effPeriod,
        toPeriod: toPeriodEnd,
        affectedMonths,
        oldMonthlyGross: oldMonthly,
        newMonthlyGross: newMonthly,
        monthlyDifference: diff,
        arrears: round2(diff * affectedMonths),
      });
    }

    return rows;
  }

  /**
   * Apply detected arrears to a payroll run. For each affected employee, an
   * ARREARS earning line is added to their payslip and an ArrearsRecord is
   * persisted (status APPLIED, linked to the run). Best-effort: callers should
   * guard so this never breaks an existing run.
   */
  async applyArrearsToRun(tenantId: string, runId: string): Promise<{ applied: number; total: number }> {
    const run = await this.runRepo.findOne({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException(`Payroll run ${runId} not found`);

    const rows = await this.detectArrears(
      tenantId,
      run.payPeriodMonth,
      run.payPeriodYear,
    );
    if (!rows.length) return { applied: 0, total: 0 };

    let applied = 0;
    let total = 0;

    for (const row of rows) {
      if (row.arrears <= 0) continue;
      const payslip = await this.payslipRepo.findOne({
        where: { tenantId, payrollRunId: runId, employeeId: row.employeeId },
      });
      if (!payslip) continue;

      const earnings: PayslipLineItem[] = [...(payslip.earnings ?? [])];
      // avoid double-applying within the same run
      const existingLine = earnings.find((e) => e.code === 'ARREARS');
      if (existingLine) {
        // recompute: remove old, add fresh
        const idx = earnings.indexOf(existingLine);
        payslip.grossEarnings = round2(payslip.grossEarnings - existingLine.amount);
        payslip.netPay = round2(payslip.netPay - existingLine.amount);
        earnings.splice(idx, 1);
      }

      earnings.push({
        code: 'ARREARS',
        name: `Salary Arrears (${row.fromPeriod} to ${row.toPeriod})`,
        amount: row.arrears,
      });

      payslip.earnings = earnings;
      payslip.grossEarnings = round2(payslip.grossEarnings + row.arrears);
      payslip.netPay = round2(payslip.netPay + row.arrears);
      await this.payslipRepo.save(payslip);

      const record = this.arrearsRepo.create({
        tenantId,
        employeeId: row.employeeId,
        fromPeriod: row.fromPeriod,
        toPeriod: row.toPeriod,
        amount: row.arrears,
        runId,
        status: ArrearsStatus.APPLIED,
      });
      await this.arrearsRepo.save(record);

      applied += 1;
      total = round2(total + row.arrears);
    }

    // update run totals additively
    if (total > 0) {
      run.totalGross = round2((run.totalGross ?? 0) + total);
      run.totalNet = round2((run.totalNet ?? 0) + total);
      await this.runRepo.save(run);
    }

    return { applied, total };
  }

  async listArrearsRecords(tenantId: string, runId?: string): Promise<ArrearsRecord[]> {
    const where: any = { tenantId };
    if (runId) where.runId = runId;
    return this.arrearsRepo.find({ where, order: { createdAt: 'DESC' } });
  }
}
