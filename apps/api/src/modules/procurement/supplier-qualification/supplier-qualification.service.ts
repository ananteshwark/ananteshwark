import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Questionnaire, QuestionDef } from './entities/questionnaire.entity';
import { QuestionnaireResponse, ResponseStatus } from './entities/questionnaire-response.entity';
import { SupplierCertificate } from './entities/supplier-certificate.entity';
import { SupplierScorecard } from './entities/supplier-scorecard.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

@Injectable()
export class SupplierQualificationService {
  constructor(
    @InjectRepository(Questionnaire) private readonly qRepo: Repository<Questionnaire>,
    @InjectRepository(QuestionnaireResponse) private readonly respRepo: Repository<QuestionnaireResponse>,
    @InjectRepository(SupplierCertificate) private readonly certRepo: Repository<SupplierCertificate>,
    @InjectRepository(SupplierScorecard) private readonly scoreRepo: Repository<SupplierScorecard>,
  ) {}

  async updateQuestionnaire(tenantId: string, id: string, dto: any): Promise<Questionnaire> {
    const q = await this.qRepo.findOne({ where: { id, tenantId } });
    if (!q) throw new NotFoundException(`Questionnaire ${id} not found`);
    const { tenantId: _t, id: _i, ...rest } = dto ?? {};
    Object.assign(q, rest);
    return this.qRepo.save(q);
  }

  // ─── Ph-202: questionnaires ───────────────────────────────────────

  listQuestionnaires(tenantId: string, category?: string): Promise<Questionnaire[]> {
    const where: any = { tenantId };
    if (category) where.category = category;
    return this.qRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async createQuestionnaire(tenantId: string, data: { name: string; category?: string; questions: QuestionDef[]; passThresholdPct?: number }): Promise<Questionnaire> {
    if (!data.name?.trim()) throw new BadRequestException('name is required');
    if (!data.questions?.length) throw new BadRequestException('at least one question is required');
    for (const q of data.questions) {
      if (!q.id || !q.text) throw new BadRequestException('each question needs an id and text');
      if (!['BOOLEAN', 'NUMERIC', 'CHOICE'].includes(q.type)) throw new BadRequestException(`invalid question type ${q.type}`);
    }
    const q = this.qRepo.create({
      tenantId, name: data.name, category: data.category ?? null,
      questions: data.questions.map((x) => ({ ...x, weight: x.weight ?? 1 })),
      passThresholdPct: data.passThresholdPct ?? 70, isActive: true,
    } as any) as unknown as Questionnaire;
    return (this.qRepo.save(q) as unknown) as Promise<Questionnaire>;
  }

  // ─── Ph-203: supplier responses + auto-score ──────────────────────

  private evaluateQuestion(q: QuestionDef, value: any): boolean {
    if (value == null) return false;
    switch (q.type) {
      case 'BOOLEAN': return Boolean(value) === Boolean(q.passValue ?? true);
      case 'NUMERIC': return Number(value) >= Number(q.passValue ?? 0);
      case 'CHOICE': return String(value) === String(q.passValue);
      default: return false;
    }
  }

  /**
   * Submit a supplier's answers; auto-scores weighted pass/fail. Scores at/above
   * the threshold are PASSED, otherwise routed to REVIEW.
   */
  async submitResponse(tenantId: string, data: { questionnaireId: string; supplierId: string; answers: Array<{ questionId: string; value: any }> }): Promise<QuestionnaireResponse> {
    const q = await this.qRepo.findOne({ where: { id: data.questionnaireId, tenantId } });
    if (!q) throw new NotFoundException('Questionnaire not found');
    const answerMap = new Map((data.answers ?? []).map((a) => [a.questionId, a.value]));
    let totalWeight = 0;
    let earned = 0;
    const failed: string[] = [];
    for (const question of q.questions) {
      const w = Number(question.weight) || 1;
      totalWeight += w;
      if (this.evaluateQuestion(question, answerMap.get(question.id))) earned += w;
      else failed.push(question.id);
    }
    const scorePct = totalWeight > 0 ? round2((earned / totalWeight) * 100) : 0;
    const status = scorePct >= Number(q.passThresholdPct) ? ResponseStatus.PASSED : ResponseStatus.REVIEW;
    const resp = this.respRepo.create({
      tenantId, questionnaireId: data.questionnaireId, supplierId: data.supplierId,
      answers: data.answers ?? [], scorePct, status, failedQuestions: failed, reviewedBy: null, reviewNotes: null,
    } as any) as unknown as QuestionnaireResponse;
    return (this.respRepo.save(resp) as unknown) as Promise<QuestionnaireResponse>;
  }

  listResponses(tenantId: string, filters: { questionnaireId?: string; supplierId?: string; status?: ResponseStatus } = {}): Promise<QuestionnaireResponse[]> {
    const where: any = { tenantId };
    if (filters.questionnaireId) where.questionnaireId = filters.questionnaireId;
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.status) where.status = filters.status;
    return this.respRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /** Reviewer override on a REVIEW response. */
  async reviewResponse(tenantId: string, id: string, userId: string, decision: 'APPROVE' | 'REJECT', notes?: string): Promise<QuestionnaireResponse> {
    const resp = await this.respRepo.findOne({ where: { id, tenantId } });
    if (!resp) throw new NotFoundException('Response not found');
    if (resp.status !== ResponseStatus.REVIEW) throw new BadRequestException('Only responses in REVIEW can be decided');
    resp.status = decision === 'APPROVE' ? ResponseStatus.APPROVED : ResponseStatus.REJECTED;
    resp.reviewedBy = userId;
    resp.reviewNotes = notes ?? null;
    return (this.respRepo.save(resp) as unknown) as Promise<QuestionnaireResponse>;
  }

  // ─── Ph-204: certificates ─────────────────────────────────────────

  async addCertificate(tenantId: string, data: { supplierId: string; certType: string; certNumber?: string; issuer?: string; issueDate?: string; expiryDate: string; documentUrl?: string }): Promise<SupplierCertificate> {
    if (!data.supplierId || !data.certType) throw new BadRequestException('supplierId and certType are required');
    if (!data.expiryDate) throw new BadRequestException('expiryDate is required');
    const c = this.certRepo.create({
      tenantId, supplierId: data.supplierId, certType: data.certType, certNumber: data.certNumber ?? null,
      issuer: data.issuer ?? null, issueDate: data.issueDate ?? null, expiryDate: data.expiryDate, documentUrl: data.documentUrl ?? null,
    } as any) as unknown as SupplierCertificate;
    return (this.certRepo.save(c) as unknown) as Promise<SupplierCertificate>;
  }

  /** Certificates with a computed expiry status as of a date. */
  async listCertificates(tenantId: string, supplierId: string, asOf: string, warnWithinDays = 30): Promise<any[]> {
    const certs = await this.certRepo.find({ where: { tenantId, supplierId }, order: { expiryDate: 'ASC' } });
    return certs.map((c) => {
      const days = daysBetween(asOf, c.expiryDate);
      const status = days < 0 ? 'EXPIRED' : days <= warnWithinDays ? 'EXPIRING' : 'VALID';
      return { ...c, daysToExpiry: days, status };
    });
  }

  /** All certificates expiring within N days (or already expired) across suppliers. */
  async expiringCertificates(tenantId: string, asOf: string, withinDays = 30): Promise<any[]> {
    const certs = await this.certRepo.find({ where: { tenantId } });
    return certs
      .map((c) => ({ ...c, daysToExpiry: daysBetween(asOf, c.expiryDate) }))
      .filter((c) => c.daysToExpiry <= withinDays)
      .map((c) => ({ ...c, status: c.daysToExpiry < 0 ? 'EXPIRED' : 'EXPIRING' }))
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  }

  // ─── Ph-205: scorecard ────────────────────────────────────────────

  /**
   * Upsert a periodic scorecard. Overall = on-time%·0.4 + (100−reject%)·0.3 +
   * invoice-accuracy%·0.3.
   */
  async upsertScorecard(tenantId: string, data: { supplierId: string; period: string; onTimeDeliveryPct: number; qualityRejectPct: number; invoiceAccuracyPct: number }): Promise<SupplierScorecard> {
    if (!/^\d{4}-\d{2}$/.test(data.period ?? '')) throw new BadRequestException('period must be YYYY-MM');
    const onTime = Number(data.onTimeDeliveryPct) || 0;
    const reject = Number(data.qualityRejectPct) || 0;
    const accuracy = Number(data.invoiceAccuracyPct) || 0;
    const overall = round2(onTime * 0.4 + (100 - reject) * 0.3 + accuracy * 0.3);
    let row = await this.scoreRepo.findOne({ where: { tenantId, supplierId: data.supplierId, period: data.period } });
    if (row) {
      Object.assign(row, { onTimeDeliveryPct: onTime, qualityRejectPct: reject, invoiceAccuracyPct: accuracy, overallScore: overall });
    } else {
      row = this.scoreRepo.create({
        tenantId, supplierId: data.supplierId, period: data.period,
        onTimeDeliveryPct: onTime, qualityRejectPct: reject, invoiceAccuracyPct: accuracy, overallScore: overall,
      } as any) as unknown as SupplierScorecard;
    }
    return (this.scoreRepo.save(row) as unknown) as Promise<SupplierScorecard>;
  }

  /** Scorecard history with period-over-period overall-score delta (trend). */
  async scorecardTrend(tenantId: string, supplierId: string): Promise<any> {
    const cards = await this.scoreRepo.find({ where: { tenantId, supplierId }, order: { period: 'ASC' } });
    let prev: number | null = null;
    const series = cards.map((c) => {
      const overall = Number(c.overallScore);
      const delta = prev == null ? null : round2(overall - prev);
      prev = overall;
      return { period: c.period, onTimeDeliveryPct: Number(c.onTimeDeliveryPct), qualityRejectPct: Number(c.qualityRejectPct), invoiceAccuracyPct: Number(c.invoiceAccuracyPct), overallScore: overall, delta };
    });
    const latest = series[series.length - 1] ?? null;
    return { supplierId, periods: series.length, latest, series };
  }
}
