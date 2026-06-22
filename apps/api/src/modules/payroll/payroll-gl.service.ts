import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PayrollGlMapping,
  PayrollGlComponentType,
} from './entities/payroll-gl-mapping.entity';
import { PayrollRun } from './runs/entities/payroll-run.entity';
import { Payslip, PayslipLineItem } from './runs/entities/payslip.entity';
import { GlService } from '../finance/gl/gl.service';
import { JournalSource } from '../finance/gl/entities/journal-entry.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface SaveGlMappingItem {
  componentType: PayrollGlComponentType;
  componentCode?: string | null;
  debitAccountId?: string | null;
  creditAccountId?: string | null;
}

@Injectable()
export class PayrollGlService {
  constructor(
    @InjectRepository(PayrollGlMapping)
    private readonly mappingRepo: Repository<PayrollGlMapping>,
    @InjectRepository(PayrollRun)
    private readonly runRepo: Repository<PayrollRun>,
    @InjectRepository(Payslip)
    private readonly payslipRepo: Repository<Payslip>,
    private readonly glService: GlService,
  ) {}

  // ---------------------------------------------------------------------------
  // Mapping CRUD
  // ---------------------------------------------------------------------------

  async getMappings(tenantId: string): Promise<PayrollGlMapping[]> {
    return this.mappingRepo.find({
      where: { tenantId },
      order: { componentType: 'ASC', componentCode: 'ASC' },
    });
  }

  async saveMappings(
    tenantId: string,
    items: SaveGlMappingItem[],
  ): Promise<PayrollGlMapping[]> {
    for (const item of items ?? []) {
      const componentCode = item.componentCode ?? null;
      let mapping = await this.mappingRepo.findOne({
        where: {
          tenantId,
          componentType: item.componentType,
          componentCode: componentCode as any,
        },
      });
      if (!mapping) {
        mapping = this.mappingRepo.create({
          tenantId,
          componentType: item.componentType,
          componentCode,
        });
      }
      mapping.debitAccountId = item.debitAccountId ?? null;
      mapping.creditAccountId = item.creditAccountId ?? null;
      await this.mappingRepo.save(mapping);
    }
    return this.getMappings(tenantId);
  }

  // ---------------------------------------------------------------------------
  // GL posting
  // ---------------------------------------------------------------------------

  /**
   * Pick the most specific mapping for a (type, code): an exact code match wins,
   * otherwise fall back to the catch-all mapping (componentCode = null).
   */
  private resolveMapping(
    mappings: PayrollGlMapping[],
    type: PayrollGlComponentType,
    code: string | null,
  ): PayrollGlMapping | undefined {
    const exact = mappings.find(
      (m) => m.componentType === type && m.componentCode === code,
    );
    if (exact) return exact;
    return mappings.find(
      (m) => m.componentType === type && m.componentCode === null,
    );
  }

  /** Aggregate a debit (or credit) onto an account bucket. */
  private addAmount(
    bucket: Map<string, { debit: number; credit: number }>,
    accountId: string | null | undefined,
    side: 'debit' | 'credit',
    amount: number,
  ): void {
    if (!accountId || amount <= 0) return;
    const entry = bucket.get(accountId) ?? { debit: 0, credit: 0 };
    entry[side] = round2(entry[side] + amount);
    bucket.set(accountId, entry);
  }

  async postPayrollToGl(
    tenantId: string,
    runId: string,
  ): Promise<any | null> {
    const run = await this.runRepo.findOne({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException(`Payroll run ${runId} not found`);

    const mappings = await this.getMappings(tenantId);
    if (!mappings.length) {
      // No mappings configured — skip silently.
      return null;
    }

    const payslips = await this.payslipRepo.find({
      where: { payrollRunId: runId, tenantId },
    });
    if (!payslips.length) return null;

    // Aggregate amounts per accountId / side.
    const bucket = new Map<string, { debit: number; credit: number }>();

    const applyLine = (
      type: PayrollGlComponentType,
      item: PayslipLineItem,
    ) => {
      const m = this.resolveMapping(mappings, type, item.code);
      if (!m) return;
      this.addAmount(bucket, m.debitAccountId, 'debit', item.amount);
      this.addAmount(bucket, m.creditAccountId, 'credit', item.amount);
    };

    for (const ps of payslips) {
      for (const e of ps.earnings ?? []) {
        applyLine(PayrollGlComponentType.EARNING, e);
      }
      for (const d of ps.deductions ?? []) {
        applyLine(PayrollGlComponentType.DEDUCTION, d);
      }
      for (const c of ps.employerContribs ?? []) {
        applyLine(PayrollGlComponentType.EMPLOYER_CONTRIBUTION, c);
      }
      // Net pay handled as a single synthetic component.
      const netMapping = this.resolveMapping(
        mappings,
        PayrollGlComponentType.NET_PAY,
        null,
      );
      if (netMapping) {
        this.addAmount(bucket, netMapping.debitAccountId, 'debit', ps.netPay);
        this.addAmount(bucket, netMapping.creditAccountId, 'credit', ps.netPay);
      }
    }

    // Build journal lines (one line per account/side bucket).
    const lines: Array<{
      accountId: string;
      debit: number;
      credit: number;
      description: string;
    }> = [];
    for (const [accountId, amt] of bucket.entries()) {
      if (amt.debit > 0) {
        lines.push({
          accountId,
          debit: amt.debit,
          credit: 0,
          description: `Payroll - ${run.name}`,
        });
      }
      if (amt.credit > 0) {
        lines.push({
          accountId,
          debit: 0,
          credit: amt.credit,
          description: `Payroll - ${run.name}`,
        });
      }
    }

    // Need a balanced entry with at least two lines.
    if (lines.length < 2) return null;
    const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
    if (totalDebit !== totalCredit || totalDebit === 0) {
      // Mappings don't produce a balanced entry — skip rather than throw.
      return null;
    }

    const je = await this.glService.postJournalEntry(
      tenantId,
      {
        date: run.payDate,
        description: `Payroll GL posting - ${run.name}`,
        reference: `PAYGL-${run.id.slice(0, 8)}`,
        source: JournalSource.PAYROLL,
        currency: run.currency || 'INR',
        lines,
      },
      null,
    );

    run.glJournalEntryId = je.id;
    await this.runRepo.save(run);
    return je;
  }
}
