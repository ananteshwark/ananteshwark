import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SodRule } from './entities/sod-rule.entity';
import { GrcControl } from './entities/grc-control.entity';
import { RiskEntry } from './entities/risk-entry.entity';

function riskLevel(score: number): string {
  if (score >= 15) return 'CRITICAL';
  if (score >= 8) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
}

@Injectable()
export class GrcService {
  constructor(
    @InjectRepository(SodRule) private readonly sodRepo: Repository<SodRule>,
    @InjectRepository(GrcControl) private readonly controlRepo: Repository<GrcControl>,
    @InjectRepository(RiskEntry) private readonly riskRepo: Repository<RiskEntry>,
  ) {}

  // ─── Ph-285: SOD conflict matrix ──────────────────────────────────

  listSodRules(tenantId: string): Promise<SodRule[]> {
    return this.sodRepo.find({ where: { tenantId }, order: { severity: 'DESC' } });
  }

  async createSodRule(tenantId: string, data: { name: string; permissionA: string; permissionB: string; severity?: string }): Promise<SodRule> {
    if (!data.permissionA || !data.permissionB) throw new BadRequestException('permissionA and permissionB are required');
    if (data.permissionA === data.permissionB) throw new BadRequestException('A conflict rule needs two different permissions');
    const r = this.sodRepo.create({ tenantId, name: data.name, permissionA: data.permissionA, permissionB: data.permissionB, severity: data.severity ?? 'HIGH', isActive: true } as any) as unknown as SodRule;
    return (this.sodRepo.save(r) as unknown) as Promise<SodRule>;
  }

  // ─── Ph-286: SOD violation detection ──────────────────────────────

  /**
   * Scan user permission sets against active SOD rules. A user holding both
   * permissions of a rule is a violation.
   */
  async detectViolations(tenantId: string, assignments: Array<{ userId: string; permissions: string[] }>): Promise<any> {
    const rules = (await this.sodRepo.find({ where: { tenantId, isActive: true } }));
    const violations: any[] = [];
    for (const a of assignments ?? []) {
      const set = new Set(a.permissions ?? []);
      for (const r of rules) {
        if (set.has(r.permissionA) && set.has(r.permissionB)) {
          violations.push({ userId: a.userId, ruleId: r.id, rule: r.name, permissions: [r.permissionA, r.permissionB], severity: r.severity });
        }
      }
    }
    const bySeverity: Record<string, number> = {};
    for (const v of violations) bySeverity[v.severity] = (bySeverity[v.severity] ?? 0) + 1;
    return { scanned: assignments?.length ?? 0, violationCount: violations.length, bySeverity, violations };
  }

  // ─── Ph-287: control framework ────────────────────────────────────

  listControls(tenantId: string): Promise<GrcControl[]> {
    return this.controlRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async createControl(tenantId: string, data: { code: string; name: string; objective?: string; ownerId?: string; testFrequency?: string }): Promise<GrcControl> {
    if (!data.code?.trim() || !data.name?.trim()) throw new BadRequestException('code and name are required');
    const dup = await this.controlRepo.findOne({ where: { tenantId, code: data.code } });
    if (dup) throw new BadRequestException('Control code already exists');
    const c = this.controlRepo.create({
      tenantId, code: data.code, name: data.name, objective: data.objective ?? null, ownerId: data.ownerId ?? null,
      testFrequency: data.testFrequency ?? 'QUARTERLY', status: 'NOT_TESTED', lastTestedAt: null, evidence: [],
    } as any) as unknown as GrcControl;
    return (this.controlRepo.save(c) as unknown) as Promise<GrcControl>;
  }

  async recordTest(tenantId: string, id: string, data: { result: 'EFFECTIVE' | 'DEFICIENT'; at: string; note?: string }): Promise<GrcControl> {
    const c = await this.controlRepo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Control not found');
    if (!['EFFECTIVE', 'DEFICIENT'].includes(data.result)) throw new BadRequestException('result must be EFFECTIVE or DEFICIENT');
    c.status = data.result;
    c.lastTestedAt = data.at.slice(0, 10);
    c.evidence = [...(c.evidence ?? []), { at: data.at, result: data.result, note: data.note }];
    return (this.controlRepo.save(c) as unknown) as Promise<GrcControl>;
  }

  // ─── Ph-288: risk register + heat map ─────────────────────────────

  async createRisk(tenantId: string, data: { title: string; category?: string; likelihood: number; impact: number; ownerId?: string; mitigatingControlIds?: string[] }): Promise<RiskEntry> {
    const l = Number(data.likelihood), i = Number(data.impact);
    if (!(l >= 1 && l <= 5) || !(i >= 1 && i <= 5)) throw new BadRequestException('likelihood and impact must be 1–5');
    const score = l * i;
    const r = this.riskRepo.create({
      tenantId, title: data.title, category: data.category ?? null, likelihood: l, impact: i, score, level: riskLevel(score),
      mitigatingControlIds: data.mitigatingControlIds ?? [], ownerId: data.ownerId ?? null, status: 'OPEN',
    } as any) as unknown as RiskEntry;
    return (this.riskRepo.save(r) as unknown) as Promise<RiskEntry>;
  }

  listRisks(tenantId: string): Promise<RiskEntry[]> {
    return this.riskRepo.find({ where: { tenantId }, order: { score: 'DESC' } });
  }

  /** 5×5 likelihood×impact heat map with per-cell counts and level totals. */
  async heatMap(tenantId: string): Promise<any> {
    const risks = await this.riskRepo.find({ where: { tenantId } });
    const grid: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
    const byLevel: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const r of risks) {
      grid[r.likelihood - 1][r.impact - 1] += 1;
      byLevel[r.level] = (byLevel[r.level] ?? 0) + 1;
    }
    return { total: risks.length, byLevel, grid };
  }
}
