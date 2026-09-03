import { Optional, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Employee, EmployeeStatus } from '../../hr/employees/entities/employee.entity';
import { EmployeeTransfer } from '../../hr/employees/entities/employee-transfer.entity';
import { LeaveApplication, LeaveApplicationStatus } from '../../hr/leave/entities/leave-application.entity';
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
    @Optional() @InjectRepository(Employee) private readonly employeeRepo?: Repository<Employee>,
    @Optional() @InjectRepository(EmployeeTransfer) private readonly transferRepo?: Repository<EmployeeTransfer>,
    @Optional() @InjectRepository(LeaveApplication) private readonly leaveRepo?: Repository<LeaveApplication>,
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

  /**
   * Attrition risk from signals already in the HCM data — no caller-supplied
   * inputs. Research-shaped heuristics, transparent factor contributions:
   *  - tenure band (1–3 years is the highest-churn window);
   *  - career stagnation (no transfer/promotion in 24+ months of service);
   *  - leave spike (>8 approved leave days in the last 90 days).
   */
  async scoreAttrition(tenantId: string): Promise<PredictiveScore[]> {
    if (!this.employeeRepo || !this.transferRepo || !this.leaveRepo) return [];
    const employees = await this.employeeRepo.find({
      where: { tenantId, status: EmployeeStatus.ACTIVE },
    });
    if (!employees.length) return [];
    const transfers = await this.transferRepo.find({ where: { tenantId } });
    const leaves = await this.leaveRepo.find({
      where: { tenantId, status: LeaveApplicationStatus.APPROVED },
    });

    const lastMoveByEmployee = new Map<string, string>();
    for (const t of transfers) {
      const prev = lastMoveByEmployee.get(t.employeeId);
      if (!prev || t.effectiveDate > prev) lastMoveByEmployee.set(t.employeeId, t.effectiveDate);
    }
    const now = Date.now();
    const days = (dateStr: string) => Math.floor((now - new Date(dateStr).getTime()) / 86_400_000);
    const ninetyDaysAgo = new Date(now - 90 * 86_400_000).toISOString().slice(0, 10);

    const results: PredictiveScore[] = [];
    for (const emp of employees) {
      const factors: Array<{ factor: string; contribution: number }> = [];
      const tenureDays = (emp as any).dateOfJoining ? days((emp as any).dateOfJoining) : 0;

      // Tenure band
      if (tenureDays >= 365 && tenureDays <= 3 * 365) {
        factors.push({ factor: 'Tenure in the 1–3 year churn window', contribution: 30 });
      } else if (tenureDays < 180) {
        factors.push({ factor: 'Early tenure (<6 months)', contribution: 15 });
      } else if (tenureDays > 5 * 365) {
        factors.push({ factor: 'Long tenure (>5 years)', contribution: 5 });
      } else {
        factors.push({ factor: 'Mid tenure', contribution: 10 });
      }

      // Career stagnation
      const lastMove = lastMoveByEmployee.get(emp.id) ?? (emp as any).dateOfJoining;
      if (lastMove && days(lastMove) > 2 * 365 && tenureDays > 2 * 365) {
        factors.push({ factor: 'No role change in 24+ months', contribution: 35 });
      }

      // Leave spike in the last 90 days
      const recentLeaveDays = leaves
        .filter((l) => l.employeeId === emp.id && l.toDate >= ninetyDaysAgo)
        .reduce((sum, l) => sum + Number(l.days ?? 0), 0);
      if (recentLeaveDays > 8) {
        factors.push({ factor: `High recent leave (${recentLeaveDays} days / 90d)`, contribution: 20 });
      }

      const score = round2(clamp(factors.reduce((a, f) => a + f.contribution, 0)));
      results.push(await this.persist(tenantId, PredictiveModel.ATTRITION_RISK, emp.id, score, factors));
    }
    return results.sort((a, b) => Number(b.score) - Number(a.score));
  }
}
