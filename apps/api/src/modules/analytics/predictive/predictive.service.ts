import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PredictiveScore, PredictiveModel } from './entities/predictive-score.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const bandFor = (score: number) => (score >= 66 ? 'HIGH' : score >= 33 ? 'MEDIUM' : 'LOW');

@Injectable()
export class PredictiveService {
  constructor(
    @InjectRepository(PredictiveScore) private readonly scoreRepo: Repository<PredictiveScore>,
  ) {}

  private async persist(tenantId: string, model: PredictiveModel, subjectId: string, score: number, factors: Array<{ factor: string; contribution: number }>): Promise<PredictiveScore> {
    const band = bandFor(score);
    let row = await this.scoreRepo.findOne({ where: { tenantId, model, subjectId } });
    if (row) { row.score = score; row.band = band; row.factors = factors; }
    else row = this.scoreRepo.create({ tenantId, model, subjectId, score, band, factors } as any) as unknown as PredictiveScore;
    return (this.scoreRepo.save(row) as unknown) as Promise<PredictiveScore>;
  }

  // ─── churn risk ───────────────────────────────────────────────────

  /**
   * Weighted churn-risk score from behavioral signals. Higher = more likely to
   * churn. Each factor contributes its weighted points.
   */
  async scoreChurn(tenantId: string, customerId: string, s: { daysSinceLastOrder?: number; openSupportTickets?: number; npsScore?: number; contractDaysToExpiry?: number }): Promise<PredictiveScore> {
    const recency = clamp(((s.daysSinceLastOrder ?? 0) / 180) * 100); // 180+ days → maxed
    const tickets = clamp((s.openSupportTickets ?? 0) * 12);
    const nps = clamp((10 - Math.max(0, Math.min(10, s.npsScore ?? 7))) * 10); // low NPS → higher risk
    const renewal = s.contractDaysToExpiry != null && s.contractDaysToExpiry <= 60 ? clamp((60 - Math.max(0, s.contractDaysToExpiry)) / 60 * 100) : 0;
    const factors = [
      { factor: 'recency', contribution: round2(recency * 0.4) },
      { factor: 'supportTickets', contribution: round2(tickets * 0.2) },
      { factor: 'nps', contribution: round2(nps * 0.25) },
      { factor: 'renewalWindow', contribution: round2(renewal * 0.15) },
    ];
    const score = round2(clamp(factors.reduce((a, f) => a + f.contribution, 0)));
    return this.persist(tenantId, PredictiveModel.CHURN_RISK, customerId, score, factors);
  }

  // ─── late payment probability ─────────────────────────────────────

  /**
   * Late-payment probability from a customer's history and the invoice's
   * exposure. Higher = more likely to pay late.
   */
  async scoreLatePayment(tenantId: string, invoiceId: string, s: { avgDaysLateHistory?: number; outstandingRatio?: number; daysToDue?: number }): Promise<PredictiveScore> {
    const history = clamp(((s.avgDaysLateHistory ?? 0) / 30) * 100);
    const exposure = clamp((s.outstandingRatio ?? 0) * 100);
    const urgency = s.daysToDue != null && s.daysToDue < 0 ? 100 : s.daysToDue != null && s.daysToDue <= 5 ? 50 : 0;
    const factors = [
      { factor: 'paymentHistory', contribution: round2(history * 0.55) },
      { factor: 'outstandingExposure', contribution: round2(exposure * 0.3) },
      { factor: 'dueUrgency', contribution: round2(urgency * 0.15) },
    ];
    const score = round2(clamp(factors.reduce((a, f) => a + f.contribution, 0)));
    return this.persist(tenantId, PredictiveModel.LATE_PAYMENT, invoiceId, score, factors);
  }

  // ─── demand forecast accuracy ─────────────────────────────────────

  /** Forecast accuracy (MAPE-based) and bias over a forecast/actual series. */
  demandForecastAccuracy(series: Array<{ forecast: number; actual: number }>): any {
    if (!series?.length) throw new BadRequestException('series is required');
    let sumApe = 0, apeCount = 0, sumErr = 0;
    for (const p of series) {
      const err = Number(p.actual) - Number(p.forecast);
      sumErr += err;
      if (Number(p.actual) !== 0) { sumApe += Math.abs(err) / Math.abs(Number(p.actual)); apeCount++; }
    }
    const mape = apeCount > 0 ? round2((sumApe / apeCount) * 100) : null;
    const accuracy = mape != null ? round2(clamp(100 - mape)) : null;
    const bias = round2(sumErr / series.length);
    return { points: series.length, mape, accuracyPct: accuracy, bias, biasDirection: bias > 0 ? 'UNDER_FORECAST' : bias < 0 ? 'OVER_FORECAST' : 'NEUTRAL' };
  }

  // ─── retrieval ────────────────────────────────────────────────────

  async topRisks(tenantId: string, model: PredictiveModel, limit = 20): Promise<PredictiveScore[]> {
    const all = await this.scoreRepo.find({ where: { tenantId, model }, order: { score: 'DESC' } });
    return all.slice(0, limit);
  }

  async getScore(tenantId: string, model: PredictiveModel, subjectId: string): Promise<PredictiveScore> {
    const row = await this.scoreRepo.findOne({ where: { tenantId, model, subjectId } });
    if (!row) throw new NotFoundException('Score not found');
    return row;
  }
}
