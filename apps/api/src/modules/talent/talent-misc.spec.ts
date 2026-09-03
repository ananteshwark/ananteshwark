import { NotFoundException } from '@nestjs/common';
import { LearningService } from './learning/learning.service';
import { EnrollmentStatus } from './learning/entities/course-enrollment.entity';
import { SuccessionService } from './succession/succession.service';
import { AppraisalService } from './appraisal/appraisal.service';
import { AppraisalResultStatus } from './appraisal/entities/appraisal-result.entity';

/**
 * Smaller talent services: learning enrollment lifecycle + skill upsert,
 * succession plan protection of tenantId/id, appraisal DRAFT → APPROVED.
 */
const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
});

describe('LearningService', () => {
  let service: LearningService;
  let courseRepo: any, enrollRepo: any, skillRepo: any;

  beforeEach(() => {
    courseRepo = mockRepo(); enrollRepo = mockRepo(); skillRepo = mockRepo();
    service = new LearningService(courseRepo, enrollRepo, skillRepo);
  });

  it('enroll starts ENROLLED with a timestamp', async () => {
    const e = await service.enroll('t1', { courseId: 'c1', employeeId: 'e1' } as any);
    expect(e.status).toBe(EnrollmentStatus.ENROLLED);
    expect(e.enrolledAt).toBeInstanceOf(Date);
  });

  it('completing an enrollment stamps completedAt', async () => {
    enrollRepo.findOne.mockResolvedValue({ id: 'en1', tenantId: 't1', status: EnrollmentStatus.IN_PROGRESS });
    const e = await service.updateEnrollment('t1', 'en1', { status: EnrollmentStatus.COMPLETED } as any);
    expect(e.completedAt).toBeInstanceOf(Date);
  });

  it('upsertSkill updates an existing row instead of duplicating', async () => {
    skillRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1', employeeId: 'e1', skill: 'SQL', proficiency: 'BEGINNER' });
    const s = await service.upsertSkill('t1', { employeeId: 'e1', skill: 'SQL', proficiency: 'EXPERT' } as any);
    expect(s.id).toBe('s1');
    expect(s.proficiency).toBe('EXPERT');
    expect(skillRepo.create).not.toHaveBeenCalled();
  });
});

describe('SuccessionService', () => {
  let service: SuccessionService;
  let planRepo: any, candidateRepo: any;

  beforeEach(() => {
    planRepo = mockRepo(); candidateRepo = mockRepo();
    service = new SuccessionService(planRepo, candidateRepo);
  });

  it('updatePlan strips tenantId/id from the patch', async () => {
    planRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', criticality: 'HIGH' });
    const p = await service.updatePlan('t1', 'p1', { criticality: 'LOW', tenantId: 't2', id: 'p9' });
    expect(p.criticality).toBe('LOW');
    expect(p.tenantId).toBe('t1');
    expect(p.id).toBe('p1');
  });

  it('getPlan returns the plan with its candidates, 404 when missing', async () => {
    planRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    candidateRepo.find.mockResolvedValue([{ id: 'c1' }]);
    const p = await service.getPlan('t1', 'p1');
    expect(p.candidates).toHaveLength(1);

    planRepo.findOne.mockResolvedValue(null);
    await expect(service.getPlan('t1', 'ghost')).rejects.toThrow(NotFoundException);
  });
});

describe('AppraisalService', () => {
  let service: AppraisalService;
  let resultRepo: any;

  beforeEach(() => {
    resultRepo = mockRepo();
    service = new AppraisalService(resultRepo);
  });

  it('results start in DRAFT and approval stamps approver + time', async () => {
    const r = await service.createAppraisalResult('t1', { employeeId: 'e1', rating: 4 } as any);
    expect(r.status).toBe(AppraisalResultStatus.DRAFT);

    resultRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', status: AppraisalResultStatus.DRAFT });
    const approved = await service.approveAppraisalResult('t1', 'a1', 'boss');
    expect(approved.status).toBe(AppraisalResultStatus.APPROVED);
    expect(approved.approvedById).toBe('boss');
    expect(approved.approvedAt).toBeInstanceOf(Date);
  });
});
