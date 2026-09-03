import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { SkillCategory } from './entities/skill-category.entity';
import { Skill } from './entities/skill.entity';
import { EmployeeSkill } from './entities/employee-skill.entity';
import { JobSkillRequirement } from './entities/job-skill-requirement.entity';
import { Course } from '../../talent/learning/entities/course.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
  remove: jest.fn().mockResolvedValue(undefined),
});

describe('SkillsService — Phase 187-190', () => {
  let service: SkillsService;
  let catRepo: any, skillRepo: any, empSkillRepo: any, reqRepo: any, courseRepo: any;

  beforeEach(async () => {
    catRepo = mockRepo(); skillRepo = mockRepo(); empSkillRepo = mockRepo(); reqRepo = mockRepo(); courseRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        SkillsService,
        { provide: getRepositoryToken(SkillCategory), useValue: catRepo },
        { provide: getRepositoryToken(Skill), useValue: skillRepo },
        { provide: getRepositoryToken(EmployeeSkill), useValue: empSkillRepo },
        { provide: getRepositoryToken(JobSkillRequirement), useValue: reqRepo },
        { provide: getRepositoryToken(Course), useValue: courseRepo },
      ],
    }).compile();
    service = module.get(SkillsService);
  });

  // ─── Ph-187: taxonomy ─────────────────────────────────────────────

  it('createCategory — rejects duplicate', async () => {
    catRepo.findOne.mockResolvedValue({ id: 'c1' });
    await expect(service.createCategory('t1', { name: 'Eng' })).rejects.toThrow(BadRequestException);
  });

  it('createSkill — throws when category missing', async () => {
    catRepo.findOne.mockResolvedValue(null);
    await expect(service.createSkill('t1', { categoryId: 'nope', name: 'Go' })).rejects.toThrow(NotFoundException);
  });

  it('createSkill — defaults maxProficiency to 5', async () => {
    catRepo.findOne.mockResolvedValue({ id: 'c1' });
    skillRepo.findOne.mockResolvedValue(null);
    await service.createSkill('t1', { categoryId: 'c1', name: 'Go' });
    expect(skillRepo.create).toHaveBeenCalledWith(expect.objectContaining({ maxProficiency: 5 }));
  });

  // ─── Ph-188: employee profile ─────────────────────────────────────

  it('assignSkill — rejects proficiency above skill max', async () => {
    skillRepo.findOne.mockResolvedValue({ id: 's1', maxProficiency: 5 });
    await expect(service.assignSkill('t1', { employeeId: 'e1', skillId: 's1', proficiency: 7 })).rejects.toThrow(BadRequestException);
  });

  it('assignSkill — upserts existing row', async () => {
    skillRepo.findOne.mockResolvedValue({ id: 's1', maxProficiency: 5 });
    empSkillRepo.findOne.mockResolvedValue({ id: 'es1', proficiency: 2 });
    empSkillRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.assignSkill('t1', { employeeId: 'e1', skillId: 's1', proficiency: 4 });
    expect(r.proficiency).toBe(4);
    expect(empSkillRepo.create).not.toHaveBeenCalled();
  });

  // ─── Ph-189: gap analysis ─────────────────────────────────────────

  it('gapAnalysis — computes gaps and readiness', async () => {
    reqRepo.find.mockResolvedValue([
      { skillId: 's1', requiredProficiency: 4, isMandatory: true },
      { skillId: 's2', requiredProficiency: 3, isMandatory: true },
    ]);
    skillRepo.find.mockResolvedValue([{ id: 's1', name: 'Go' }, { id: 's2', name: 'SQL' }]);
    empSkillRepo.find.mockResolvedValue([{ skillId: 's1', proficiency: 4 }, { skillId: 's2', proficiency: 1 }]);
    const r = await service.gapAnalysis('t1', 'e1', 'job1');
    expect(r.total).toBe(2);
    expect(r.met).toBe(1);
    expect(r.readiness).toBe(0.5);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0]).toMatchObject({ skillName: 'SQL', required: 3, current: 1, gap: 2 });
  });

  it('gapAnalysis — empty when no requirements', async () => {
    reqRepo.find.mockResolvedValue([]);
    const r = await service.gapAnalysis('t1', 'e1', 'job1');
    expect(r.readiness).toBe(1);
    expect(r.gaps).toEqual([]);
  });

  it('departmentGap — averages gaps across employees', async () => {
    reqRepo.find.mockResolvedValue([{ skillId: 's1', requiredProficiency: 4 }]);
    skillRepo.find.mockResolvedValue([{ id: 's1', name: 'Go' }]);
    empSkillRepo.find.mockResolvedValue([
      { employeeId: 'e1', skillId: 's1', proficiency: 4 },
      { employeeId: 'e2', skillId: 's1', proficiency: 2 },
    ]);
    const r = await service.departmentGap('t1', 'job1', ['e1', 'e2']);
    expect(r.headcount).toBe(2);
    expect(r.skills[0]).toMatchObject({ skillName: 'Go', avgGap: 1, employeesBelow: 1 });
  });

  // ─── Ph-190: learning recommendations ─────────────────────────────

  it('recommendLearning — matches courses to gap skills by tag', async () => {
    reqRepo.find.mockResolvedValue([{ skillId: 's1', requiredProficiency: 4, isMandatory: true }]);
    skillRepo.find.mockResolvedValue([{ id: 's1', name: 'SQL' }]);
    empSkillRepo.find.mockResolvedValue([{ skillId: 's1', proficiency: 1 }]);
    courseRepo.find.mockResolvedValue([
      { id: 'crs1', code: 'SQL101', title: 'Intro SQL', durationHours: 8, skillTags: ['SQL', 'Databases'] },
      { id: 'crs2', code: 'GO201', title: 'Go', durationHours: 12, skillTags: ['Golang'] },
    ]);
    const r = await service.recommendLearning('t1', 'e1', 'job1');
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0].courses).toHaveLength(1);
    expect(r.recommendations[0].courses[0].code).toBe('SQL101');
  });

  it('recommendLearning — no gaps yields empty recommendations', async () => {
    reqRepo.find.mockResolvedValue([{ skillId: 's1', requiredProficiency: 2 }]);
    skillRepo.find.mockResolvedValue([{ id: 's1', name: 'SQL' }]);
    empSkillRepo.find.mockResolvedValue([{ skillId: 's1', proficiency: 3 }]);
    const r = await service.recommendLearning('t1', 'e1', 'job1');
    expect(r.recommendations).toEqual([]);
  });
});
