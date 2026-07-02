import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SkillCategory } from './entities/skill-category.entity';
import { Skill } from './entities/skill.entity';
import { EmployeeSkill } from './entities/employee-skill.entity';
import { JobSkillRequirement } from './entities/job-skill-requirement.entity';
import { Course } from '../../talent/learning/entities/course.entity';

@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(SkillCategory) private readonly catRepo: Repository<SkillCategory>,
    @InjectRepository(Skill) private readonly skillRepo: Repository<Skill>,
    @InjectRepository(EmployeeSkill) private readonly empSkillRepo: Repository<EmployeeSkill>,
    @InjectRepository(JobSkillRequirement) private readonly reqRepo: Repository<JobSkillRequirement>,
    @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
  ) {}

  async updateSkill(tenantId: string, id: string, dto: any): Promise<Skill> {
    const s = await this.skillRepo.findOne({ where: { id, tenantId } });
    if (!s) throw new NotFoundException(`Skill ${id} not found`);
    const { tenantId: _t, id: _i, ...rest } = dto ?? {};
    Object.assign(s, rest);
    return (this.skillRepo.save(s) as unknown) as Promise<Skill>;
  }

  async updateCategory(tenantId: string, id: string, dto: any): Promise<SkillCategory> {
    const c = await this.catRepo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Category ${id} not found`);
    const { tenantId: _t, id: _i, ...rest } = dto ?? {};
    Object.assign(c, rest);
    return (this.catRepo.save(c) as unknown) as Promise<SkillCategory>;
  }

  // ─── Ph-187: skills taxonomy ──────────────────────────────────────

  listCategories(tenantId: string): Promise<SkillCategory[]> {
    return this.catRepo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  async createCategory(tenantId: string, data: { name: string; description?: string }): Promise<SkillCategory> {
    if (!data.name?.trim()) throw new BadRequestException('name is required');
    const dup = await this.catRepo.findOne({ where: { tenantId, name: data.name } });
    if (dup) throw new BadRequestException('Category already exists');
    const c = this.catRepo.create({ tenantId, name: data.name, description: data.description ?? null } as any) as unknown as SkillCategory;
    return (this.catRepo.save(c) as unknown) as Promise<SkillCategory>;
  }

  listSkills(tenantId: string, categoryId?: string): Promise<Skill[]> {
    const where: any = { tenantId };
    if (categoryId) where.categoryId = categoryId;
    return this.skillRepo.find({ where, order: { name: 'ASC' } });
  }

  async createSkill(tenantId: string, data: { categoryId: string; name: string; description?: string; maxProficiency?: number }): Promise<Skill> {
    if (!data.name?.trim()) throw new BadRequestException('name is required');
    const cat = await this.catRepo.findOne({ where: { id: data.categoryId, tenantId } });
    if (!cat) throw new NotFoundException(`Category ${data.categoryId} not found`);
    const max = data.maxProficiency ?? 5;
    if (max < 1 || max > 10) throw new BadRequestException('maxProficiency must be between 1 and 10');
    const dup = await this.skillRepo.findOne({ where: { tenantId, name: data.name } });
    if (dup) throw new BadRequestException('Skill already exists');
    const s = this.skillRepo.create({
      tenantId, categoryId: data.categoryId, name: data.name,
      description: data.description ?? null, maxProficiency: max, isActive: true,
    } as any) as unknown as Skill;
    return (this.skillRepo.save(s) as unknown) as Promise<Skill>;
  }

  // ─── Ph-188: employee skills profile ──────────────────────────────

  listEmployeeSkills(tenantId: string, employeeId: string): Promise<EmployeeSkill[]> {
    return this.empSkillRepo.find({ where: { tenantId, employeeId }, order: { proficiency: 'DESC' } });
  }

  /** Upsert an employee's proficiency in a skill (1..skill.maxProficiency). */
  async assignSkill(tenantId: string, data: {
    employeeId: string; skillId: string; proficiency: number; assessedBy?: string; assessedAt?: string;
  }): Promise<EmployeeSkill> {
    const skill = await this.skillRepo.findOne({ where: { id: data.skillId, tenantId } });
    if (!skill) throw new NotFoundException(`Skill ${data.skillId} not found`);
    if (data.proficiency < 1 || data.proficiency > skill.maxProficiency) {
      throw new BadRequestException(`proficiency must be between 1 and ${skill.maxProficiency}`);
    }
    let row = await this.empSkillRepo.findOne({ where: { tenantId, employeeId: data.employeeId, skillId: data.skillId } });
    if (row) {
      row.proficiency = data.proficiency;
      row.assessedBy = data.assessedBy ?? row.assessedBy;
      row.assessedAt = data.assessedAt ?? row.assessedAt;
    } else {
      row = this.empSkillRepo.create({
        tenantId, employeeId: data.employeeId, skillId: data.skillId, proficiency: data.proficiency,
        assessedBy: data.assessedBy ?? null, assessedAt: data.assessedAt ?? null,
      } as any) as unknown as EmployeeSkill;
    }
    return (this.empSkillRepo.save(row) as unknown) as Promise<EmployeeSkill>;
  }

  async removeEmployeeSkill(tenantId: string, id: string): Promise<{ deleted: boolean }> {
    const row = await this.empSkillRepo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`Employee skill ${id} not found`);
    await this.empSkillRepo.remove(row);
    return { deleted: true };
  }

  // ─── Ph-189: job requirements + gap analysis ──────────────────────

  listJobRequirements(tenantId: string, jobId: string): Promise<JobSkillRequirement[]> {
    return this.reqRepo.find({ where: { tenantId, jobId } });
  }

  async setJobRequirement(tenantId: string, data: {
    jobId: string; skillId: string; requiredProficiency: number; isMandatory?: boolean;
  }): Promise<JobSkillRequirement> {
    const skill = await this.skillRepo.findOne({ where: { id: data.skillId, tenantId } });
    if (!skill) throw new NotFoundException(`Skill ${data.skillId} not found`);
    if (data.requiredProficiency < 1 || data.requiredProficiency > skill.maxProficiency) {
      throw new BadRequestException(`requiredProficiency must be between 1 and ${skill.maxProficiency}`);
    }
    let row = await this.reqRepo.findOne({ where: { tenantId, jobId: data.jobId, skillId: data.skillId } });
    if (row) {
      row.requiredProficiency = data.requiredProficiency;
      row.isMandatory = data.isMandatory ?? row.isMandatory;
    } else {
      row = this.reqRepo.create({
        tenantId, jobId: data.jobId, skillId: data.skillId,
        requiredProficiency: data.requiredProficiency, isMandatory: data.isMandatory ?? true,
      } as any) as unknown as JobSkillRequirement;
    }
    return (this.reqRepo.save(row) as unknown) as Promise<JobSkillRequirement>;
  }

  /**
   * Gap analysis: compare an employee's proficiencies against a job's
   * requirements. gap = required - current (>0 means under-qualified).
   */
  async gapAnalysis(tenantId: string, employeeId: string, jobId: string): Promise<any> {
    const reqs = await this.reqRepo.find({ where: { tenantId, jobId } });
    if (reqs.length === 0) return { employeeId, jobId, gaps: [], met: 0, total: 0, readiness: 1 };
    const skillIds = reqs.map((r) => r.skillId);
    const [skills, empSkills] = await Promise.all([
      this.skillRepo.find({ where: { tenantId, id: In(skillIds) } }),
      this.empSkillRepo.find({ where: { tenantId, employeeId, skillId: In(skillIds) } }),
    ]);
    const nameOf = new Map(skills.map((s) => [s.id, s.name]));
    const profOf = new Map(empSkills.map((e) => [e.skillId, e.proficiency]));
    let met = 0;
    const gaps = reqs.map((r) => {
      const current = profOf.get(r.skillId) ?? 0;
      const gap = Math.max(0, r.requiredProficiency - current);
      if (gap === 0) met++;
      return {
        skillId: r.skillId, skillName: nameOf.get(r.skillId) ?? r.skillId,
        required: r.requiredProficiency, current, gap, isMandatory: r.isMandatory,
      };
    });
    return {
      employeeId, jobId, total: reqs.length, met,
      readiness: Math.round((met / reqs.length) * 100) / 100,
      gaps: gaps.filter((g) => g.gap > 0),
    };
  }

  /**
   * Department-level gap rollup: average gap per required skill across a set
   * of employees in a job/role.
   */
  async departmentGap(tenantId: string, jobId: string, employeeIds: string[]): Promise<any> {
    if (!employeeIds?.length) throw new BadRequestException('employeeIds required');
    const reqs = await this.reqRepo.find({ where: { tenantId, jobId } });
    if (reqs.length === 0) return { jobId, headcount: employeeIds.length, skills: [] };
    const skillIds = reqs.map((r) => r.skillId);
    const [skills, empSkills] = await Promise.all([
      this.skillRepo.find({ where: { tenantId, id: In(skillIds) } }),
      this.empSkillRepo.find({ where: { tenantId, employeeId: In(employeeIds), skillId: In(skillIds) } }),
    ]);
    const nameOf = new Map(skills.map((s) => [s.id, s.name]));
    const skillRows = reqs.map((r) => {
      let totalGap = 0;
      let below = 0;
      for (const emp of employeeIds) {
        const prof = empSkills.find((e) => e.employeeId === emp && e.skillId === r.skillId)?.proficiency ?? 0;
        const gap = Math.max(0, r.requiredProficiency - prof);
        totalGap += gap;
        if (gap > 0) below++;
      }
      return {
        skillId: r.skillId, skillName: nameOf.get(r.skillId) ?? r.skillId,
        required: r.requiredProficiency,
        avgGap: Math.round((totalGap / employeeIds.length) * 100) / 100,
        employeesBelow: below,
      };
    });
    return { jobId, headcount: employeeIds.length, skills: skillRows.sort((a, b) => b.avgGap - a.avgGap) };
  }

  // ─── Ph-190: AI-suggested learning ────────────────────────────────

  /**
   * Recommend active courses to close an employee's skill gaps for a job.
   * Matches a course's skillTags against gap skill names (case-insensitive).
   */
  async recommendLearning(tenantId: string, employeeId: string, jobId: string): Promise<any> {
    const analysis = await this.gapAnalysis(tenantId, employeeId, jobId);
    const gaps: any[] = analysis.gaps ?? [];
    if (gaps.length === 0) return { employeeId, jobId, recommendations: [] };
    const courses = await this.courseRepo.find({ where: { tenantId, isActive: true } });
    const recommendations = gaps.map((g) => {
      const needle = g.skillName.toLowerCase();
      const matched = courses
        .filter((c) => (c.skillTags ?? []).some((t) => String(t).toLowerCase().includes(needle) || needle.includes(String(t).toLowerCase())))
        .map((c) => ({ courseId: c.id, code: c.code, title: c.title, durationHours: c.durationHours }));
      return { skillId: g.skillId, skillName: g.skillName, gap: g.gap, courses: matched };
    }).filter((r) => r.courses.length > 0);
    const unmatched = gaps.filter((g) => !recommendations.some((r) => r.skillId === g.skillId)).map((g) => g.skillName);
    return { employeeId, jobId, recommendations, unmatchedSkills: unmatched };
  }
}
