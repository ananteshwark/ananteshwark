import { Injectable, Logger, Optional, Inject, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { EmployeeSkill } from '../../hr/skills/entities/employee-skill.entity';
import { JobSkillRequirement } from '../../hr/skills/entities/job-skill-requirement.entity';
import { Skill } from '../../hr/skills/entities/skill.entity';

export const AI_CAREER_LLM_CLIENT = 'AI_CAREER_LLM_CLIENT';

export interface JobMatch {
  jobId: string;
  score: number;              // 0–100 weighted skill coverage
  matched: number;
  gaps: Array<{ skillId: string; requiredProficiency: number; have: number; mandatory: boolean }>;
  blockedByMandatory: boolean;
}

/**
 * AI career layer: internal-job (IJP) matching, role clustering, and role-fit
 * exploration — all deterministic and testable. Career reflection adds an
 * optional Claude-authored narrative, gated on ANTHROPIC_API_KEY; without a key
 * the whole module still works and returns a structured summary instead.
 */
@Injectable()
export class AiCareerService {
  private readonly logger = new Logger(AiCareerService.name);
  private readonly client: Anthropic | null;

  constructor(
    @InjectRepository(EmployeeSkill) private readonly empSkillRepo: Repository<EmployeeSkill>,
    @InjectRepository(JobSkillRequirement) private readonly reqRepo: Repository<JobSkillRequirement>,
    @InjectRepository(Skill) private readonly skillRepo: Repository<Skill>,
    @Optional() @Inject(AI_CAREER_LLM_CLIENT) client?: Anthropic,
  ) {
    this.client = client ?? (process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 1, timeout: 30_000 }) : null);
  }

  get llmEnabled(): boolean {
    return !!this.client;
  }

  // ─── Scoring core (pure) ──────────────────────────────────────

  /**
   * Weighted skill-coverage score for one job. Each requirement contributes by
   * its required proficiency; an employee earns the fraction they meet
   * (capped at 1). A missing mandatory requirement blocks the match.
   */
  static scoreJob(
    have: Map<string, number>,
    requirements: Array<{ skillId: string; requiredProficiency: number; isMandatory: boolean }>,
  ): Omit<JobMatch, 'jobId'> {
    if (!requirements.length) return { score: 0, matched: 0, gaps: [], blockedByMandatory: false };
    let weight = 0, earned = 0, matched = 0, blocked = false;
    const gaps: JobMatch['gaps'] = [];
    for (const r of requirements) {
      const w = Math.max(1, r.requiredProficiency);
      weight += w;
      const got = have.get(r.skillId) ?? 0;
      const ratio = Math.min(1, got / Math.max(1, r.requiredProficiency));
      earned += w * ratio;
      if (got >= r.requiredProficiency) matched++;
      else {
        gaps.push({ skillId: r.skillId, requiredProficiency: r.requiredProficiency, have: got, mandatory: r.isMandatory });
        if (r.isMandatory) blocked = true;
      }
    }
    return { score: Math.round((earned / weight) * 100), matched, gaps, blockedByMandatory: blocked };
  }

  /** Jaccard similarity between two skill-id sets. */
  static jaccard(a: Set<string>, b: Set<string>): number {
    if (!a.size && !b.size) return 1;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const union = a.size + b.size - inter;
    return union ? inter / union : 0;
  }

  /** Greedy agglomerative clustering of items by skill-set similarity. */
  static clusterBySkills(items: Array<{ id: string; skillIds: string[] }>, threshold = 0.4): Array<{ members: string[]; sharedSkills: string[] }> {
    const clusters: Array<{ members: string[]; skillSets: Set<string>[] }> = [];
    for (const item of items) {
      const set = new Set(item.skillIds);
      let placed = false;
      for (const c of clusters) {
        // Compare against the cluster's first member (representative).
        if (AiCareerService.jaccard(set, c.skillSets[0]) >= threshold) {
          c.members.push(item.id); c.skillSets.push(set); placed = true; break;
        }
      }
      if (!placed) clusters.push({ members: [item.id], skillSets: [set] });
    }
    return clusters.map((c) => {
      const shared = [...c.skillSets[0]].filter((s) => c.skillSets.every((set) => set.has(s)));
      return { members: c.members, sharedSkills: shared };
    });
  }

  // ─── IJP matching ─────────────────────────────────────────────

  async matchInternalJobs(tenantId: string, employeeId: string, opts?: { limit?: number; includeBlocked?: boolean }): Promise<JobMatch[]> {
    const haveRows = await this.empSkillRepo.find({ where: { tenantId, employeeId } });
    const have = new Map(haveRows.map((r) => [r.skillId, Number(r.proficiency)]));
    const reqs = await this.reqRepo.find({ where: { tenantId } });
    const byJob = new Map<string, JobSkillRequirement[]>();
    for (const r of reqs) (byJob.get(r.jobId) ?? byJob.set(r.jobId, []).get(r.jobId)!).push(r);

    let matches: JobMatch[] = [...byJob.entries()].map(([jobId, requirements]) => ({
      jobId, ...AiCareerService.scoreJob(have, requirements),
    }));
    if (!opts?.includeBlocked) matches = matches.filter((m) => !m.blockedByMandatory);
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, opts?.limit ?? 10);
  }

  // ─── Role clustering ──────────────────────────────────────────

  async clusterRoles(tenantId: string, threshold = 0.4): Promise<Array<{ members: string[]; sharedSkills: string[] }>> {
    const reqs = await this.reqRepo.find({ where: { tenantId } });
    const byJob = new Map<string, string[]>();
    for (const r of reqs) (byJob.get(r.jobId) ?? byJob.set(r.jobId, []).get(r.jobId)!).push(r.skillId);
    const items = [...byJob.entries()].map(([id, skillIds]) => ({ id, skillIds }));
    return AiCareerService.clusterBySkills(items, threshold);
  }

  // ─── Role-fit exploration ─────────────────────────────────────

  async exploreRoleFit(tenantId: string, employeeId: string, jobId: string): Promise<{
    jobId: string; fitScore: number; strengths: string[]; gaps: Array<{ skillId: string; skillName: string; requiredProficiency: number; have: number }>;
  }> {
    const requirements = await this.reqRepo.find({ where: { tenantId, jobId } });
    if (!requirements.length) throw new BadRequestException(`No skill requirements defined for job ${jobId}`);
    const haveRows = await this.empSkillRepo.find({ where: { tenantId, employeeId } });
    const have = new Map(haveRows.map((r) => [r.skillId, Number(r.proficiency)]));
    const scored = AiCareerService.scoreJob(have, requirements);
    const skillIds = requirements.map((r) => r.skillId);
    const skills = skillIds.length ? await this.skillRepo.find({ where: { tenantId, id: In(skillIds) } }) : [];
    const nameOf = new Map(skills.map((s) => [s.id, s.name]));
    const strengths = requirements.filter((r) => (have.get(r.skillId) ?? 0) >= r.requiredProficiency).map((r) => nameOf.get(r.skillId) ?? r.skillId);
    return {
      jobId, fitScore: scored.score, strengths,
      gaps: scored.gaps.map((g) => ({ skillId: g.skillId, skillName: nameOf.get(g.skillId) ?? g.skillId, requiredProficiency: g.requiredProficiency, have: g.have })),
    };
  }

  // ─── Career reflection (LLM-optional) ─────────────────────────

  /**
   * A career-reflection narrative. With a Claude key it authors a short
   * paragraph; without one it returns a deterministic structured summary so
   * the feature never hard-depends on the LLM.
   */
  async careerReflection(input: { employeeName: string; currentRole?: string; topSkills: string[]; aspirations?: string; recentGrowth?: string[] }): Promise<{ source: 'llm' | 'template'; reflection: string; suggestedFocus: string[] }> {
    const suggestedFocus = (input.topSkills ?? []).slice(0, 3);
    if (!this.client) {
      const parts = [
        `${input.employeeName}${input.currentRole ? `, ${input.currentRole},` : ''} brings strengths in ${suggestedFocus.join(', ') || 'a range of areas'}.`,
        input.aspirations ? `Stated aspiration: ${input.aspirations}.` : '',
        'Consider deepening the top strengths above and pursuing a stretch project that exercises them.',
      ].filter(Boolean);
      return { source: 'template', reflection: parts.join(' '), suggestedFocus };
    }
    try {
      const response = await this.client.messages.create({
        model: process.env.AI_CAREER_MODEL ?? 'claude-opus-4-8',
        max_tokens: 512,
        output_config: { effort: 'low' },
        system: 'You are a supportive career coach. Write a concise (3-4 sentence) reflection for the employee, grounded only in the facts provided. No invented achievements.',
        messages: [{ role: 'user', content: JSON.stringify(input) }],
      } as Anthropic.MessageCreateParamsNonStreaming);
      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { source: 'llm', reflection: text || 'No reflection generated.', suggestedFocus };
    } catch (e: any) {
      this.logger.warn(`career reflection LLM failed: ${e?.message ?? e}`);
      return { source: 'template', reflection: `${input.employeeName}: focus on ${suggestedFocus.join(', ')}.`, suggestedFocus };
    }
  }
}
