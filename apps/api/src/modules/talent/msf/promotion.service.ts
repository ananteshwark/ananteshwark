import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromotionCase, PromotionStatus, AchievementMatrix } from './entities/promotion.entity';
import { AutomationService } from '../../automation/automation.service';

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

@Injectable()
export class PromotionService {
  constructor(
    @InjectRepository(PromotionCase) private readonly caseRepo: Repository<PromotionCase>,
    @InjectRepository(AchievementMatrix) private readonly matrixRepo: Repository<AchievementMatrix>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  /**
   * Weighted, normalised readiness score (0–100): Σ(weight × score/maxScore) /
   * Σ(weight) × 100. This is the configurable "custom formula".
   */
  static computeReadiness(criteria: Array<{ weight: number; score: number; maxScore: number }>): number | null {
    const valid = (criteria ?? []).filter((c) => Number(c.weight) > 0 && Number(c.maxScore) > 0);
    if (!valid.length) return null;
    const totalWeight = valid.reduce((s, c) => s + Number(c.weight), 0);
    const weighted = valid.reduce((s, c) => s + Number(c.weight) * (Number(c.score) / Number(c.maxScore)), 0);
    return round2((weighted / totalWeight) * 100);
  }

  // ─── Promotion cases ──────────────────────────────────────────

  async createCase(tenantId: string, dto: { employeeId: string; employeeName: string; fromLevel?: string; toLevel?: string; criteria?: any[] }): Promise<PromotionCase> {
    if (!dto.employeeId || !dto.employeeName?.trim()) throw new BadRequestException('employeeId and employeeName are required');
    const criteria = this.normaliseCriteria(dto.criteria ?? []);
    return this.caseRepo.save(this.caseRepo.create({
      tenantId, employeeId: dto.employeeId, employeeName: dto.employeeName.trim(),
      fromLevel: dto.fromLevel ?? null, toLevel: dto.toLevel ?? null,
      criteria, readinessScore: PromotionService.computeReadiness(criteria), status: PromotionStatus.DRAFT,
    }));
  }

  private normaliseCriteria(criteria: any[]): Array<{ key: string; label: string; weight: number; score: number; maxScore: number }> {
    return (criteria ?? [])
      .filter((c) => c && c.key?.trim())
      .map((c) => ({
        key: String(c.key).trim(), label: c.label ?? c.key,
        weight: Number(c.weight ?? 1), score: Number(c.score ?? 0), maxScore: Number(c.maxScore ?? 5),
      }));
  }

  listCases(tenantId: string, status?: PromotionStatus): Promise<PromotionCase[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.caseRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getCase(tenantId: string, id: string): Promise<PromotionCase> {
    const c = await this.caseRepo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Promotion case ${id} not found`);
    return c;
  }

  async scoreCase(tenantId: string, id: string, criteria: any[]): Promise<PromotionCase> {
    const promo = await this.getCase(tenantId, id);
    if (promo.status === PromotionStatus.APPROVED || promo.status === PromotionStatus.DECLINED) {
      throw new BadRequestException('A decided case cannot be re-scored');
    }
    promo.criteria = this.normaliseCriteria(criteria);
    promo.readinessScore = PromotionService.computeReadiness(promo.criteria);
    return this.caseRepo.save(promo);
  }

  async submitForReview(tenantId: string, id: string): Promise<PromotionCase> {
    const promo = await this.getCase(tenantId, id);
    if (promo.status !== PromotionStatus.DRAFT) throw new BadRequestException('Only DRAFT cases can be submitted');
    if (!promo.criteria.length) throw new BadRequestException('Score the case before submitting for review');
    promo.status = PromotionStatus.IN_REVIEW;
    return this.caseRepo.save(promo);
  }

  async decide(tenantId: string, id: string, dto: { approve: boolean; decidedByUserId: string; recommendation?: string; panelNotes?: string }): Promise<PromotionCase> {
    const promo = await this.getCase(tenantId, id);
    if (promo.status !== PromotionStatus.IN_REVIEW) throw new BadRequestException('Only IN_REVIEW cases can be decided');
    promo.status = dto.approve ? PromotionStatus.APPROVED : PromotionStatus.DECLINED;
    promo.decidedByUserId = dto.decidedByUserId;
    promo.decidedAt = new Date();
    if (dto.recommendation) promo.recommendation = dto.recommendation;
    if (dto.panelNotes) promo.panelNotes = dto.panelNotes;
    const saved = await this.caseRepo.save(promo);
    await this.automation?.emit(tenantId, 'promotion.decided', {
      caseId: saved.id, employeeId: saved.employeeId, decision: saved.status,
      toLevel: saved.toLevel, readinessScore: saved.readinessScore,
    });
    return saved;
  }

  // ─── Achievement matrix (N-grid) ──────────────────────────────

  async createMatrix(tenantId: string, dto: { name: string; rowAxis?: string; colAxis?: string; rowBands: string[]; colBands: string[]; cells?: Record<string, { recommendation: string; note?: string }> }): Promise<AchievementMatrix> {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    if (!dto.rowBands?.length || !dto.colBands?.length) throw new BadRequestException('rowBands and colBands are required');
    return this.matrixRepo.save(this.matrixRepo.create({
      tenantId, name: dto.name.trim(),
      rowAxis: dto.rowAxis ?? 'Potential', colAxis: dto.colAxis ?? 'Performance',
      rowBands: dto.rowBands, colBands: dto.colBands, cells: dto.cells ?? {},
    }));
  }

  listMatrices(tenantId: string): Promise<AchievementMatrix[]> {
    return this.matrixRepo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  async setCell(tenantId: string, matrixId: string, rowBand: string, colBand: string, value: { recommendation: string; note?: string }): Promise<AchievementMatrix> {
    const matrix = await this.matrixRepo.findOne({ where: { id: matrixId, tenantId } });
    if (!matrix) throw new NotFoundException(`Matrix ${matrixId} not found`);
    if (!matrix.rowBands.includes(rowBand) || !matrix.colBands.includes(colBand)) {
      throw new BadRequestException('rowBand and colBand must be defined bands of the matrix');
    }
    matrix.cells = { ...matrix.cells, [`${rowBand}|${colBand}`]: { recommendation: value.recommendation, note: value.note } };
    return this.matrixRepo.save(matrix);
  }

  /** Resolve the recommendation cell for a (rowBand, colBand) placement. */
  async placeOnMatrix(tenantId: string, matrixId: string, rowBand: string, colBand: string): Promise<{ rowBand: string; colBand: string; recommendation: string | null; note?: string }> {
    const matrix = await this.matrixRepo.findOne({ where: { id: matrixId, tenantId } });
    if (!matrix) throw new NotFoundException(`Matrix ${matrixId} not found`);
    if (!matrix.rowBands.includes(rowBand) || !matrix.colBands.includes(colBand)) {
      throw new BadRequestException('rowBand and colBand must be defined bands of the matrix');
    }
    const cell = matrix.cells[`${rowBand}|${colBand}`];
    return { rowBand, colBand, recommendation: cell?.recommendation ?? null, note: cell?.note };
  }
}
