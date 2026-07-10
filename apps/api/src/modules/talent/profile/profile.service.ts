import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { EmployeeSkill } from '../../hr/skills/entities/employee-skill.entity';
import { Objective } from '../goals/entities/objective.entity';
import { Recognition } from '../../engagement/entities/recognition.entity';
import { IdpPlan } from '../idp/idp.entity';
import { ContinuousFeedback } from '../feedback/feedback.entity';

/**
 * Talent Profile: a single read-only snapshot aggregating the talent signals
 * scattered across HCM — identity, skills, current goals, recognition, active
 * development plans, and recent feedback. Every source is optional so the
 * profile returns whatever the deployment has wired.
 */
@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @Optional() @InjectRepository(EmployeeSkill) private readonly skillRepo?: Repository<EmployeeSkill>,
    @Optional() @InjectRepository(Objective) private readonly objectiveRepo?: Repository<Objective>,
    @Optional() @InjectRepository(Recognition) private readonly recognitionRepo?: Repository<Recognition>,
    @Optional() @InjectRepository(IdpPlan) private readonly idpRepo?: Repository<IdpPlan>,
    @Optional() @InjectRepository(ContinuousFeedback) private readonly feedbackRepo?: Repository<ContinuousFeedback>,
  ) {}

  private async safeFind<T>(repo: Repository<T> | undefined, where: any, order?: any): Promise<T[]> {
    if (!repo) return [];
    return repo.find({ where, ...(order ? { order } : {}) }).catch(() => [] as T[]);
  }

  async getProfile(tenantId: string, employeeId: string) {
    const employee = await this.employeeRepo.findOne({ where: { id: employeeId, tenantId } as any });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);

    const [skills, goals, recognitions, plans, feedback] = await Promise.all([
      this.safeFind(this.skillRepo, { tenantId, employeeId }),
      this.safeFind(this.objectiveRepo, { tenantId, ownerId: employeeId }, { createdAt: 'DESC' }),
      this.safeFind(this.recognitionRepo, { tenantId, toEmployeeId: employeeId }, { createdAt: 'DESC' }),
      this.safeFind(this.idpRepo, { tenantId, employeeId }, { createdAt: 'DESC' }),
      this.safeFind(this.feedbackRepo, { tenantId, toEmployeeId: employeeId }, { createdAt: 'DESC' }),
    ]);

    const recognitionPoints = recognitions.reduce((sum, r) => sum + (Number((r as any).points) || 0), 0);

    return {
      employee: {
        id: employee.id,
        name: [employee.firstName, employee.lastName].filter(Boolean).join(' '),
        email: employee.email,
        departmentId: employee.departmentId,
        designationId: employee.designationId,
        managerId: employee.managerId,
        dateOfJoining: employee.dateOfJoining,
        status: employee.status,
      },
      skills: skills.map((s: any) => ({ skillId: s.skillId, proficiency: s.proficiency ?? s.proficiencyLevel ?? null })),
      goals: goals.map((g: any) => ({ id: g.id, title: g.title, progress: Number(g.progress), status: g.status })),
      recognition: {
        count: recognitions.length,
        points: recognitionPoints,
        recent: recognitions.slice(0, 5).map((r: any) => ({ badgeName: r.badgeName, fromName: r.fromName, createdAt: r.createdAt })),
      },
      developmentPlans: plans.map((p: any) => ({ id: p.id, title: p.title, status: p.status })),
      feedback: {
        count: feedback.length,
        recent: feedback.slice(0, 5).map((f: any) => ({ kind: f.kind, fromName: f.fromName, createdAt: f.createdAt })),
      },
      summary: {
        skillCount: skills.length,
        activeGoals: goals.filter((g: any) => g.status !== 'ACHIEVED' && g.status !== 'CANCELLED').length,
        recognitionPoints,
        openDevelopmentPlans: plans.filter((p: any) => p.status === 'ACTIVE' || p.status === 'DRAFT').length,
      },
    };
  }
}
