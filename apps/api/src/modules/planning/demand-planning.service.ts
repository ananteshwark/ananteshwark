import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DemandForecast,
  ForecastMethod,
  ForecastStatus,
} from './entities/demand-forecast.entity';
import { ForecastPeriod } from './entities/forecast-period.entity';
import {
  GenerateForecastDto,
  AdjustPeriodDto,
  RecordActualDto,
} from './dto/demand-planning.dto';
import { SalesOrderLine } from '../sales/entities/sales-order-line.entity';
import { SalesOrder } from '../sales/entities/sales-order.entity';
import { Item } from '../inventory/entities/item.entity';

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ForecastDetail {
  forecast: DemandForecast;
  periods: Array<ForecastPeriod & { finalQty: number }>;
  accuracy: { mape: number | null; bias: number | null; periodsScored: number };
}

@Injectable()
export class DemandPlanningService {
  constructor(
    @InjectRepository(DemandForecast)
    private readonly forecastRepo: Repository<DemandForecast>,
    @InjectRepository(ForecastPeriod)
    private readonly periodRepo: Repository<ForecastPeriod>,
    @InjectRepository(SalesOrderLine)
    private readonly soLineRepo: Repository<SalesOrderLine>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
  ) {}

  // ─── Forecasting algorithms (pure) ─────────────────────────────────────────────

  /** Simple average of the last `window` observations. */
  movingAverage(history: number[], window: number): number {
    if (window <= 0) throw new BadRequestException('windowSize must be at least 1');
    const slice = history.slice(-window);
    if (slice.length === 0) return 0;
    return round4(slice.reduce((s, v) => s + v, 0) / slice.length);
  }

  /** Weighted average of the last `weights.length` observations (most recent last). */
  weightedMovingAverage(history: number[], weights: number[]): number {
    if (!weights || weights.length === 0) {
      throw new BadRequestException('weights must contain at least one value');
    }
    const slice = history.slice(-weights.length);
    // Align weights to the available slice (drop oldest weights if history is short).
    const usedWeights = weights.slice(weights.length - slice.length);
    const weightSum = usedWeights.reduce((s, w) => s + w, 0);
    if (weightSum <= 0) throw new BadRequestException('weights must sum to a positive value');
    const weighted = slice.reduce((s, v, i) => s + v * usedWeights[i], 0);
    return round4(weighted / weightSum);
  }

  /** Exponential smoothing; returns the smoothed level (the next-period forecast). */
  exponentialSmoothing(history: number[], alpha: number): number {
    if (alpha <= 0 || alpha > 1) throw new BadRequestException('alpha must be in (0, 1]');
    if (history.length === 0) return 0;
    let level = history[0];
    for (let i = 1; i < history.length; i++) {
      level = alpha * history[i] + (1 - alpha) * level;
    }
    return round4(level);
  }

  // ─── Sales history ──────────────────────────────────────────────────────────────

  private monthsBackSeries(monthCount: number): Array<{ label: string; firstDay: string }> {
    const now = new Date();
    // End with the previous complete month.
    const series: Array<{ label: string; firstDay: string }> = [];
    for (let i = monthCount; i >= 1; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      series.push({ label: `${d.getFullYear()}-${mm}`, firstDay: `${d.getFullYear()}-${mm}-01` });
    }
    return series;
  }

  private horizonSeries(horizon: number): Array<{ label: string; firstDay: string }> {
    const now = new Date();
    const series: Array<{ label: string; firstDay: string }> = [];
    for (let i = 0; i < horizon; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      series.push({ label: `${d.getFullYear()}-${mm}`, firstDay: `${d.getFullYear()}-${mm}-01` });
    }
    return series;
  }

  /** Monthly shipped/ordered quantity for an item from non-cancelled sales orders. */
  async getSalesHistory(
    tenantId: string,
    itemId: string,
    months: number,
  ): Promise<Array<{ periodLabel: string; qty: number }>> {
    const rows = await this.soLineRepo
      .createQueryBuilder('l')
      .innerJoin(SalesOrder, 'o', 'o.id = l.order_id')
      .select("to_char(o.order_date, 'YYYY-MM')", 'period')
      .addSelect('COALESCE(SUM(l.quantity), 0)', 'qty')
      .where('l.tenant_id = :tenantId', { tenantId })
      .andWhere('l.inventory_item_id = :itemId', { itemId })
      .andWhere('o.status != :cancelled', { cancelled: 'CANCELLED' })
      .groupBy("to_char(o.order_date, 'YYYY-MM')")
      .getRawMany();

    const byLabel = new Map<string, number>(rows.map((r) => [r.period, Number(r.qty)]));
    // Fill a continuous series (missing months → 0) so intermittent demand is handled.
    return this.monthsBackSeries(months).map((m) => ({
      periodLabel: m.label,
      qty: round4(byLabel.get(m.label) ?? 0),
    }));
  }

  // ─── Forecast generation ──────────────────────────────────────────────────────

  private computeForecastValue(method: ForecastMethod, history: number[], dto: GenerateForecastDto): number {
    switch (method) {
      case ForecastMethod.MOVING_AVERAGE:
        return this.movingAverage(history, dto.windowSize ?? 3);
      case ForecastMethod.WEIGHTED_MOVING_AVERAGE:
        return this.weightedMovingAverage(history, dto.weights ?? [1, 2, 3]);
      case ForecastMethod.EXPONENTIAL_SMOOTHING:
        return this.exponentialSmoothing(history, dto.alpha ?? 0.3);
      case ForecastMethod.MANUAL:
        if (dto.manualQty == null) throw new BadRequestException('manualQty is required for the MANUAL method');
        return round4(dto.manualQty);
      default:
        return 0;
    }
  }

  async generateForecast(tenantId: string, dto: GenerateForecastDto): Promise<ForecastDetail> {
    const item = await this.itemRepo.findOne({ where: { tenantId, id: dto.itemId } });
    if (!item) throw new NotFoundException(`Item ${dto.itemId} not found`);

    const historyMonths = dto.historyMonths ?? 12;
    const horizon = dto.horizonPeriods ?? 6;
    const history = await this.getSalesHistory(tenantId, dto.itemId, historyMonths);
    const historyQty = history.map((h) => h.qty);

    const forecastValue = this.computeForecastValue(dto.method, historyQty, dto);

    const parameters: Record<string, any> = {};
    if (dto.windowSize != null) parameters.windowSize = dto.windowSize;
    if (dto.weights != null) parameters.weights = dto.weights;
    if (dto.alpha != null) parameters.alpha = dto.alpha;
    if (dto.manualQty != null) parameters.manualQty = dto.manualQty;

    const forecast = (await this.forecastRepo.save(
      (this.forecastRepo.create({
        tenantId,
        itemId: dto.itemId,
        itemName: item.name,
        method: dto.method,
        historyMonths,
        horizonPeriods: horizon,
        parameters,
        status: ForecastStatus.DRAFT,
        notes: dto.notes ?? null,
      } as any) as unknown) as DemandForecast,
    )) as unknown as DemandForecast;

    const periodEntities = this.horizonSeries(horizon).map(
      (p) =>
        (this.periodRepo.create({
          tenantId,
          forecastId: forecast.id,
          itemId: dto.itemId,
          periodStart: p.firstDay,
          periodLabel: p.label,
          forecastQty: forecastValue,
          adjustedQty: null,
          actualQty: null,
          releasedToSupply: false,
        } as any) as unknown) as ForecastPeriod,
    );
    await this.periodRepo.save(periodEntities);

    return this.getForecastDetail(tenantId, forecast.id);
  }

  // ─── Queries ──────────────────────────────────────────────────────────────────

  async listForecasts(tenantId: string, filters: { itemId?: string; status?: string } = {}): Promise<DemandForecast[]> {
    const qb = this.forecastRepo.createQueryBuilder('f').where('f.tenant_id = :tenantId', { tenantId });
    if (filters.itemId) qb.andWhere('f.item_id = :itemId', { itemId: filters.itemId });
    if (filters.status) qb.andWhere('f.status = :status', { status: filters.status });
    return qb.orderBy('f.created_at', 'DESC').getMany();
  }

  async getForecast(tenantId: string, id: string): Promise<DemandForecast> {
    const forecast = await this.forecastRepo.findOne({ where: { tenantId, id } });
    if (!forecast) throw new NotFoundException(`Forecast ${id} not found`);
    return forecast;
  }

  private finalQty(p: ForecastPeriod): number {
    return round4(p.adjustedQty != null ? Number(p.adjustedQty) : Number(p.forecastQty));
  }

  /** Mean absolute percentage error + bias over periods that have actuals. */
  computeAccuracy(periods: ForecastPeriod[]): { mape: number | null; bias: number | null; periodsScored: number } {
    const scored = periods.filter((p) => p.actualQty != null && Number(p.actualQty) !== 0);
    if (scored.length === 0) return { mape: null, bias: null, periodsScored: 0 };
    let apeSum = 0;
    let biasSum = 0;
    for (const p of scored) {
      const actual = Number(p.actualQty);
      const fin = this.finalQty(p);
      apeSum += Math.abs(fin - actual) / Math.abs(actual);
      biasSum += fin - actual;
    }
    return {
      mape: round2((apeSum / scored.length) * 100),
      bias: round2(biasSum / scored.length),
      periodsScored: scored.length,
    };
  }

  async getForecastDetail(tenantId: string, id: string): Promise<ForecastDetail> {
    const forecast = await this.getForecast(tenantId, id);
    const periods = await this.periodRepo.find({
      where: { tenantId, forecastId: id },
      order: { periodLabel: 'ASC' },
    });
    const enriched = periods.map((p) => ({ ...p, finalQty: this.finalQty(p) }));
    return { forecast, periods: enriched as any, accuracy: this.computeAccuracy(periods) };
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────────

  async adjustPeriod(tenantId: string, periodId: string, dto: AdjustPeriodDto): Promise<ForecastPeriod> {
    const period = await this.periodRepo.findOne({ where: { tenantId, id: periodId } });
    if (!period) throw new NotFoundException(`Forecast period ${periodId} not found`);
    period.adjustedQty = round4(dto.adjustedQty);
    return (this.periodRepo.save(period) as unknown) as Promise<ForecastPeriod>;
  }

  async recordActual(tenantId: string, periodId: string, dto: RecordActualDto): Promise<ForecastPeriod> {
    const period = await this.periodRepo.findOne({ where: { tenantId, id: periodId } });
    if (!period) throw new NotFoundException(`Forecast period ${periodId} not found`);
    period.actualQty = round4(dto.actualQty);
    return (this.periodRepo.save(period) as unknown) as Promise<ForecastPeriod>;
  }

  async releaseForecast(tenantId: string, id: string): Promise<ForecastDetail> {
    const forecast = await this.getForecast(tenantId, id);
    if (forecast.status === ForecastStatus.ARCHIVED) {
      throw new BadRequestException('Archived forecasts cannot be released');
    }
    // Releasing supersedes any prior released forecast for the same item.
    const priorReleased = await this.forecastRepo.find({
      where: { tenantId, itemId: forecast.itemId, status: ForecastStatus.RELEASED },
    });
    for (const prior of priorReleased) {
      if (prior.id === forecast.id) continue;
      prior.status = ForecastStatus.ARCHIVED;
      await this.forecastRepo.save(prior);
      await this.periodRepo.update(
        { tenantId, forecastId: prior.id },
        { releasedToSupply: false },
      );
    }

    forecast.status = ForecastStatus.RELEASED;
    await this.forecastRepo.save(forecast);
    await this.periodRepo.update({ tenantId, forecastId: id }, { releasedToSupply: true });
    return this.getForecastDetail(tenantId, id);
  }

  /**
   * Released demand by item/period — the planned independent requirements that
   * supply planning (MRP) can consume. Optionally filtered to a horizon window.
   */
  async getReleasedDemand(
    tenantId: string,
    opts: { from?: string; to?: string } = {},
  ): Promise<Array<{ itemId: string; periodLabel: string; periodStart: string; qty: number }>> {
    const qb = this.periodRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.released_to_supply = true');
    if (opts.from) qb.andWhere('p.period_start >= :from', { from: opts.from });
    if (opts.to) qb.andWhere('p.period_start <= :to', { to: opts.to });
    const periods = await qb.orderBy('p.period_start', 'ASC').getMany();
    return periods.map((p) => ({
      itemId: p.itemId,
      periodLabel: p.periodLabel,
      periodStart: p.periodStart,
      qty: this.finalQty(p),
    }));
  }
}
