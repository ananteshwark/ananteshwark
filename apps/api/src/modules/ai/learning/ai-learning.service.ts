import { Injectable, Optional, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { Course } from '../../talent/learning/entities/course.entity';
import { Skill } from '../../hr/skills/entities/skill.entity';
import { EmployeeSkill } from '../../hr/skills/entities/employee-skill.entity';
import { JobSkillRequirement } from '../../hr/skills/entities/job-skill-requirement.entity';

export const AI_LEARNING_LLM_CLIENT = 'AI_LEARNING_LLM_CLIENT';

function tokens(s: string): Set<string> {
  return new Set((s ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2));
}

@Injectable()
export class AiLearningService {
  private readonly client: Anthropic | null;

  constructor(
    @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
    @InjectRepository(Skill) private readonly skillRepo: Repository<Skill>,
    @InjectRepository(EmployeeSkill) private readonly empSkillRepo: Repository<EmployeeSkill>,
    @InjectRepository(JobSkillRequirement) private readonly reqRepo: Repository<JobSkillRequirement>,
    @Optional() @Inject(AI_LEARNING_LLM_CLIENT) client?: Anthropic,
  ) {
    this.client = client ?? (process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 1, timeout: 30_000 }) : null);
  }

  get llmEnabled(): boolean { return !!this.client; }

  // ─── Skill inference (pure) ───────────────────────────────────

  /**
   * Infer likely skills from free-text signals (title, projects, completed
   * courses) by matching each skill's name against the signal tokens. Confidence
   * scales with the number of distinct signals mentioning the skill.
   */
  static inferSkills(
    signalTexts: string[],
    catalog: Array<{ id: string; name: string }>,
  ): Array<{ skillId: string; skillName: string; confidence: number; hits: number }> {
    const signalTokenSets = (signalTexts ?? []).filter(Boolean).map(tokens);
    const out: Array<{ skillId: string; skillName: string; confidence: number; hits: number }> = [];
    for (const skill of catalog) {
      const nameTokens = [...tokens(skill.name)];
      if (!nameTokens.length) continue;
      let hits = 0;
      for (const sig of signalTokenSets) {
        if (nameTokens.every((t) => sig.has(t))) hits++;
      }
      if (hits > 0) {
        const confidence = Math.min(1, Math.round((hits / Math.max(1, signalTokenSets.length)) * 100) / 100);
        out.push({ skillId: skill.id, skillName: skill.name, confidence, hits });
      }
    }
    return out.sort((a, b) => b.confidence - a.confidence || b.hits - a.hits);
  }

  async inferForEmployee(tenantId: string, signals: string[]): Promise<Array<{ skillId: string; skillName: string; confidence: number; hits: number }>> {
    const catalog = await this.skillRepo.find({ where: { tenantId } });
    return AiLearningService.inferSkills(signals, catalog.map((s) => ({ id: s.id, name: s.name })));
  }

  // ─── Skill-to-course mapping (pure) ───────────────────────────

  /** Map a course to the catalog skills it develops, via skillTags then title/description. */
  static mapCourseToSkills(
    course: { skillTags?: string[]; title?: string; description?: string | null },
    catalog: Array<{ id: string; name: string }>,
  ): Array<{ skillId: string; skillName: string; via: 'tag' | 'text' }> {
    const tagSet = new Set((course.skillTags ?? []).map((t) => t.toLowerCase()));
    const text = tokens(`${course.title ?? ''} ${course.description ?? ''}`);
    const out: Array<{ skillId: string; skillName: string; via: 'tag' | 'text' }> = [];
    for (const skill of catalog) {
      const lname = skill.name.toLowerCase();
      if (tagSet.has(lname)) out.push({ skillId: skill.id, skillName: skill.name, via: 'tag' });
      else if ([...tokens(skill.name)].every((t) => text.has(t))) out.push({ skillId: skill.id, skillName: skill.name, via: 'text' });
    }
    return out;
  }

  async mapCoursesToSkills(tenantId: string): Promise<Array<{ courseId: string; title: string; skills: Array<{ skillId: string; skillName: string; via: string }> }>> {
    const [courses, catalog] = await Promise.all([
      this.courseRepo.find({ where: { tenantId, isActive: true } }),
      this.skillRepo.find({ where: { tenantId } }),
    ]);
    const lite = catalog.map((s) => ({ id: s.id, name: s.name }));
    return courses.map((c) => ({ courseId: c.id, title: c.title, skills: AiLearningService.mapCourseToSkills(c, lite) }));
  }

  // ─── Learning recommendations ─────────────────────────────────

  /**
   * Recommend courses to close an employee's gaps against a target job: rank
   * courses by how many gap skills they teach.
   */
  async recommendForJob(tenantId: string, employeeId: string, jobId: string, limit = 5): Promise<Array<{ courseId: string; title: string; coversSkillIds: string[]; coverage: number }>> {
    const reqs = await this.reqRepo.find({ where: { tenantId, jobId } });
    const have = new Map((await this.empSkillRepo.find({ where: { tenantId, employeeId } })).map((r) => [r.skillId, Number(r.proficiency)]));
    const gapSkillIds = reqs.filter((r) => (have.get(r.skillId) ?? 0) < r.requiredProficiency).map((r) => r.skillId);
    if (!gapSkillIds.length) return [];
    const gapSkills = await this.skillRepo.find({ where: { tenantId, id: In(gapSkillIds) } });
    const gapNames = new Set(gapSkills.map((s) => s.name.toLowerCase()));
    const gapByName = new Map(gapSkills.map((s) => [s.name.toLowerCase(), s.id]));

    const courses = await this.courseRepo.find({ where: { tenantId, isActive: true } });
    const scored = courses.map((c) => {
      const covers = new Set<string>();
      for (const tag of c.skillTags ?? []) if (gapNames.has(tag.toLowerCase())) covers.add(gapByName.get(tag.toLowerCase())!);
      return { courseId: c.id, title: c.title, coversSkillIds: [...covers], coverage: covers.size };
    }).filter((c) => c.coverage > 0);
    scored.sort((a, b) => b.coverage - a.coverage);
    return scored.slice(0, limit);
  }

  // ─── Learning search (pure ranking) ───────────────────────────

  static rankCourses(
    query: string,
    courses: Array<{ id: string; title: string; description?: string | null; skillTags?: string[] }>,
    limit = 10,
  ): Array<{ courseId: string; title: string; score: number }> {
    const terms = [...tokens(query)];
    if (!terms.length) return [];
    const scored = courses.map((c) => {
      const title = (c.title ?? '').toLowerCase();
      const tags = (c.skillTags ?? []).map((t) => t.toLowerCase());
      const body = (c.description ?? '').toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 5;
        if (tags.some((tag) => tag.includes(t))) score += 3;
        if (body.includes(t)) score += 1;
      }
      return { courseId: c.id, title: c.title, score };
    }).filter((c) => c.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async searchCourses(tenantId: string, query: string, limit = 10): Promise<Array<{ courseId: string; title: string; score: number }>> {
    const courses = await this.courseRepo.find({ where: { tenantId, isActive: true } });
    return AiLearningService.rankCourses(query, courses, limit);
  }
}
