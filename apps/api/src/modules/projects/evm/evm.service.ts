import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EvmBaseline, EvmBaselineStatus } from './entities/evm-baseline.entity';
import { EvmBaselineLine } from './entities/evm-baseline-line.entity';
import { EvmMeasurement } from './entities/evm-measurement.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

@Injectable()
export class EvmService {
  constructor(
    @InjectRepository(EvmBaseline) private readonly baselineRepo: Repository<EvmBaseline>,
    @InjectRepository(EvmBaselineLine) private readonly lineRepo: Repository<EvmBaselineLine>,
    @InjectRepository(EvmMeasurement) private readonly measureRepo: Repository<EvmMeasurement>,
  ) {}

  // ─── Ph-245: EVM baseline (PMB) ───────────────────────────────────

  async createBaseline(tenantId: string, projectId: string, lines: Array<{ taskId: string; plannedValue: number; plannedStart?: string; plannedFinish?: string }>, notes?: string): Promise<any> {
    if (!lines?.length) throw new BadRequestException('at least one baseline line is required');
    for (const l of lines) if (!l.taskId) throw new BadRequestException('each line needs a taskId');
    const prior = await this.baselineRepo.findOne({ where: { tenantId, projectId }, order: { version: 'DESC' } });
    if (prior && prior.status === EvmBaselineStatus.ACTIVE) { prior.status = EvmBaselineStatus.SUPERSEDED; await this.baselineRepo.save(prior); }
    const version = prior ? prior.version + 1 : 1;
    const bac = round2(lines.reduce((s, l) => s + (Number(l.plannedValue) || 0), 0));
    const baseline = (await this.baselineRepo.save(this.baselineRepo.create({
      tenantId, projectId, version, status: EvmBaselineStatus.ACTIVE, bac, notes: notes ?? null,
    } as any))) as unknown as EvmBaseline;
    for (const l of lines) {
      await this.lineRepo.save(this.lineRepo.create({
        tenantId, baselineId: baseline.id, projectId, taskId: l.taskId, plannedValue: l.plannedValue,
        plannedStart: l.plannedStart ?? null, plannedFinish: l.plannedFinish ?? null,
      } as any));
    }
    return { baseline, lineCount: lines.length };
  }

  private async activeBaseline(tenantId: string, projectId: string): Promise<EvmBaseline> {
    const b = await this.baselineRepo.findOne({ where: { tenantId, projectId, status: EvmBaselineStatus.ACTIVE } });
    if (!b) throw new NotFoundException('No active EVM baseline for this project');
    return b;
  }

  async getBaselineLines(tenantId: string, projectId: string): Promise<EvmBaselineLine[]> {
    const b = await this.activeBaseline(tenantId, projectId);
    return this.lineRepo.find({ where: { tenantId, baselineId: b.id } });
  }

  // ─── Ph-246: EVM calculations ─────────────────────────────────────

  /**
   * Record a task measurement for a period. PV = taskBudget × pctScheduled;
   * EV = taskBudget × pctComplete; AC input. Derives SPI = EV/PV, CPI = EV/AC.
   */
  async recordMeasurement(tenantId: string, data: { projectId: string; taskId: string; period: string; pctScheduled: number; pctComplete: number; actualCost: number }): Promise<EvmMeasurement> {
    if (!/^\d{4}-\d{2}$/.test(data.period ?? '')) throw new BadRequestException('period must be YYYY-MM');
    const baseline = await this.activeBaseline(tenantId, data.projectId);
    const line = await this.lineRepo.findOne({ where: { tenantId, baselineId: baseline.id, taskId: data.taskId } });
    if (!line) throw new NotFoundException(`Task ${data.taskId} not in the active baseline`);
    const budget = Number(line.plannedValue);
    const pv = round2((budget * Number(data.pctScheduled)) / 100);
    const ev = round2((budget * Number(data.pctComplete)) / 100);
    const ac = round2(Number(data.actualCost));
    const spi = pv > 0 ? round3(ev / pv) : null;
    const cpi = ac > 0 ? round3(ev / ac) : null;

    let row = await this.measureRepo.findOne({ where: { tenantId, projectId: data.projectId, taskId: data.taskId, period: data.period } });
    if (row) {
      Object.assign(row, { pctScheduled: data.pctScheduled, pctComplete: data.pctComplete, plannedValue: pv, earnedValue: ev, actualCost: ac, spi, cpi });
    } else {
      row = this.measureRepo.create({
        tenantId, projectId: data.projectId, taskId: data.taskId, period: data.period,
        pctScheduled: data.pctScheduled, pctComplete: data.pctComplete, plannedValue: pv, earnedValue: ev, actualCost: ac, spi, cpi,
      } as any) as unknown as EvmMeasurement;
    }
    return (this.measureRepo.save(row) as unknown) as Promise<EvmMeasurement>;
  }

  /** Aggregate project EVM for a period, with forecasts (EAC/VAC/ETC). */
  async projectMetrics(tenantId: string, projectId: string, period: string): Promise<any> {
    const baseline = await this.activeBaseline(tenantId, projectId);
    const measures = await this.measureRepo.find({ where: { tenantId, projectId, period } });
    const pv = round2(measures.reduce((s, m) => s + Number(m.plannedValue), 0));
    const ev = round2(measures.reduce((s, m) => s + Number(m.earnedValue), 0));
    const ac = round2(measures.reduce((s, m) => s + Number(m.actualCost), 0));
    const bac = Number(baseline.bac);
    const spi = pv > 0 ? round3(ev / pv) : null;
    const cpi = ac > 0 ? round3(ev / ac) : null;
    const eac = cpi && cpi > 0 ? round2(bac / cpi) : null;
    const vac = eac != null ? round2(bac - eac) : null;
    const etc = eac != null ? round2(eac - ac) : null;
    return {
      projectId, period, bac,
      pv, ev, ac,
      scheduleVariance: round2(ev - pv), costVariance: round2(ev - ac),
      spi, cpi, eac, vac, etc,
      pctComplete: bac > 0 ? round2((ev / bac) * 100) : 0,
      taskCount: measures.length,
    };
  }

  taskMeasurements(tenantId: string, projectId: string, period: string): Promise<EvmMeasurement[]> {
    return this.measureRepo.find({ where: { tenantId, projectId, period }, order: { taskId: 'ASC' } });
  }

  // ─── Ph-247: S-curve + FAC ────────────────────────────────────────

  /**
   * Cumulative PV/EV/AC per period (the S-curve) plus a forecast-at-completion
   * from the latest period's CPI.
   */
  async sCurve(tenantId: string, projectId: string): Promise<any> {
    const baseline = await this.activeBaseline(tenantId, projectId);
    const measures = await this.measureRepo.find({ where: { tenantId, projectId }, order: { period: 'ASC' } });
    const periods = [...new Set(measures.map((m) => m.period))].sort();
    let cumPv = 0, cumEv = 0, cumAc = 0;
    const series = periods.map((p) => {
      const inP = measures.filter((m) => m.period === p);
      cumPv = round2(cumPv + inP.reduce((s, m) => s + Number(m.plannedValue), 0));
      cumEv = round2(cumEv + inP.reduce((s, m) => s + Number(m.earnedValue), 0));
      cumAc = round2(cumAc + inP.reduce((s, m) => s + Number(m.actualCost), 0));
      return {
        period: p, cumulativePV: cumPv, cumulativeEV: cumEv, cumulativeAC: cumAc,
        scheduleVariance: round2(cumEv - cumPv), costVariance: round2(cumEv - cumAc),
      };
    });
    const latest = series[series.length - 1];
    const bac = Number(baseline.bac);
    const cpi = latest && latest.cumulativeAC > 0 ? round3(latest.cumulativeEV / latest.cumulativeAC) : null;
    const fac = cpi && cpi > 0 ? round2(bac / cpi) : null; // forecast at completion
    return { projectId, bac, series, forecastAtCompletion: fac, latestCpi: cpi };
  }
}
