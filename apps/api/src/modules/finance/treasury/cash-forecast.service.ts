import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashForecast, CashForecastLine, ForecastBucket, ForecastCategory } from './entities/cash-forecast.entity';
import { FinancialInstrument, InstrumentStatus } from './entities/financial-instrument.entity';
import { Bill, BillStatus } from '../ap/entities/bill.entity';
import { Invoice, InvoiceStatus } from '../ar/entities/invoice.entity';
import { PayrollRun } from '../../payroll/runs/entities/payroll-run.entity';
import { BankTransaction } from '../bank/entities/bank-transaction.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class CashForecastService {
  constructor(
    @InjectRepository(CashForecast) private readonly forecastRepo: Repository<CashForecast>,
    @InjectRepository(CashForecastLine) private readonly lineRepo: Repository<CashForecastLine>,
    @InjectRepository(Bill) private readonly billRepo: Repository<Bill>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(PayrollRun) private readonly payrollRepo: Repository<PayrollRun>,
    @InjectRepository(FinancialInstrument) private readonly instrumentRepo: Repository<FinancialInstrument>,
    @InjectRepository(BankTransaction) private readonly bankTxnRepo: Repository<BankTransaction>,
  ) {}

  /** Bucket a date to its period-start key. */
  bucketKey(date: string, bucket: ForecastBucket): string {
    if (bucket === ForecastBucket.DAILY) return date;
    if (bucket === ForecastBucket.MONTHLY) return `${date.slice(0, 7)}-01`;
    // weekly → Monday of the ISO week
    const d = new Date(date + 'T00:00:00Z');
    const day = d.getUTCDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  inRange(date: string, from: string, to: string): boolean {
    return date >= from && date <= to;
  }

  // ─── Ph-128: Forecast engine ──────────────────────────────────────

  /**
   * Build (and persist) a cash forecast across AR receipts, AP payments,
   * payroll disbursements and instrument maturities, bucketed by day/week/month.
   */
  async generateForecast(tenantId: string, data: {
    name: string; fromDate: string; toDate: string; bucket?: ForecastBucket; openingBalance?: number;
  }): Promise<CashForecast> {
    if (!data.fromDate || !data.toDate) throw new BadRequestException('fromDate and toDate are required');
    if (data.fromDate > data.toDate) throw new BadRequestException('fromDate must be on or before toDate');
    const bucket = data.bucket ?? ForecastBucket.WEEKLY;

    const lines: { periodKey: string; category: ForecastCategory; amount: number }[] = [];

    // AR receipts (inflow +)
    const invoices = await this.invoiceRepo.find({ where: { tenantId } });
    for (const inv of invoices) {
      if (![InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE].includes(inv.status)) continue;
      if (Number(inv.balanceDue) <= 0 || !this.inRange(inv.dueDate, data.fromDate, data.toDate)) continue;
      lines.push({ periodKey: this.bucketKey(inv.dueDate, bucket), category: ForecastCategory.AR_RECEIPT, amount: round2(Number(inv.balanceDue)) });
    }
    // AP payments (outflow −)
    const bills = await this.billRepo.find({ where: { tenantId } });
    for (const b of bills) {
      if (![BillStatus.OPEN, BillStatus.PARTIAL].includes(b.status)) continue;
      if (Number(b.balanceDue) <= 0 || !this.inRange(b.dueDate, data.fromDate, data.toDate)) continue;
      lines.push({ periodKey: this.bucketKey(b.dueDate, bucket), category: ForecastCategory.AP_PAYMENT, amount: -round2(Number(b.balanceDue)) });
    }
    // Payroll (outflow −)
    const runs = await this.payrollRepo.find({ where: { tenantId } });
    for (const r of runs) {
      if (!r.payDate || !this.inRange(r.payDate, data.fromDate, data.toDate)) continue;
      if (Number(r.totalNet) <= 0) continue;
      lines.push({ periodKey: this.bucketKey(r.payDate, bucket), category: ForecastCategory.PAYROLL, amount: -round2(Number(r.totalNet)) });
    }
    // Instrument maturities (inflow +)
    const instruments = await this.instrumentRepo.find({ where: { tenantId } });
    for (const ins of instruments) {
      if (ins.status !== InstrumentStatus.ACTIVE || !ins.maturityDate) continue;
      if (!this.inRange(ins.maturityDate, data.fromDate, data.toDate)) continue;
      lines.push({ periodKey: this.bucketKey(ins.maturityDate, bucket), category: ForecastCategory.INSTRUMENT_MATURITY, amount: round2(Number(ins.faceValue) + Number(ins.interestAccrued)) });
    }

    // aggregate by (periodKey, category)
    const agg = new Map<string, { periodKey: string; category: ForecastCategory; amount: number }>();
    for (const l of lines) {
      const key = `${l.periodKey}|${l.category}`;
      const e = agg.get(key);
      if (e) e.amount = round2(e.amount + l.amount);
      else agg.set(key, { ...l });
    }

    const inflow = round2([...agg.values()].filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
    const outflow = round2([...agg.values()].filter((l) => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0));

    const forecast = (await this.forecastRepo.save(
      this.forecastRepo.create({
        tenantId,
        name: data.name,
        fromDate: data.fromDate,
        toDate: data.toDate,
        bucket,
        openingBalance: data.openingBalance ?? 0,
        forecastInflow: inflow,
        forecastOutflow: outflow,
      } as any),
    )) as unknown as CashForecast;

    for (const l of agg.values()) {
      await this.lineRepo.save(
        this.lineRepo.create({ tenantId, forecastId: forecast.id, periodKey: l.periodKey, category: l.category, forecastAmount: l.amount } as any),
      );
    }
    return forecast;
  }

  async listForecasts(tenantId: string): Promise<CashForecast[]> {
    return this.forecastRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  /** Forecast header + lines rolled into a running-balance projection by period. */
  async getForecast(tenantId: string, id: string): Promise<any> {
    const forecast = await this.forecastRepo.findOne({ where: { id, tenantId } });
    if (!forecast) throw new NotFoundException(`Forecast ${id} not found`);
    const lines = await this.lineRepo.find({ where: { tenantId, forecastId: id } });

    const byPeriod = new Map<string, { period: string; inflow: number; outflow: number; net: number }>();
    for (const l of lines) {
      if (!byPeriod.has(l.periodKey)) byPeriod.set(l.periodKey, { period: l.periodKey, inflow: 0, outflow: 0, net: 0 });
      const row = byPeriod.get(l.periodKey)!;
      const amt = Number(l.forecastAmount);
      if (amt >= 0) row.inflow = round2(row.inflow + amt);
      else row.outflow = round2(row.outflow + Math.abs(amt));
      row.net = round2(row.net + amt);
    }
    let running = Number(forecast.openingBalance);
    const periods = [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period)).map((p) => {
      running = round2(running + p.net);
      return { ...p, closingBalance: running };
    });
    return { forecast, lines, periods };
  }

  // ─── Ph-129: Variance analysis ────────────────────────────────────

  /**
   * Compare forecast net per period against actual net cash movement (signed
   * bank transactions) over the same buckets.
   */
  async varianceReport(tenantId: string, id: string): Promise<any> {
    const forecast = await this.forecastRepo.findOne({ where: { id, tenantId } });
    if (!forecast) throw new NotFoundException(`Forecast ${id} not found`);
    const lines = await this.lineRepo.find({ where: { tenantId, forecastId: id } });

    const forecastByPeriod = new Map<string, number>();
    for (const l of lines) {
      forecastByPeriod.set(l.periodKey, round2((forecastByPeriod.get(l.periodKey) ?? 0) + Number(l.forecastAmount)));
    }

    const txns = await this.bankTxnRepo
      .createQueryBuilder('t')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.date >= :from AND t.date <= :to', { from: forecast.fromDate, to: forecast.toDate })
      .getMany();
    const actualByPeriod = new Map<string, number>();
    for (const t of txns) {
      const key = this.bucketKey(t.date, forecast.bucket);
      actualByPeriod.set(key, round2((actualByPeriod.get(key) ?? 0) + Number(t.amount)));
    }

    const periods = new Set([...forecastByPeriod.keys(), ...actualByPeriod.keys()]);
    const rows = [...periods].sort().map((period) => {
      const forecastNet = forecastByPeriod.get(period) ?? 0;
      const actualNet = actualByPeriod.get(period) ?? 0;
      return { period, forecastNet, actualNet, variance: round2(actualNet - forecastNet) };
    });
    const totalForecast = round2(rows.reduce((s, r) => s + r.forecastNet, 0));
    const totalActual = round2(rows.reduce((s, r) => s + r.actualNet, 0));
    return { forecast, rows, totalForecast, totalActual, totalVariance: round2(totalActual - totalForecast) };
  }
}
