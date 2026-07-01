import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { ProjectResource } from './entities/project-resource.entity';
import { ResourceRequest, ResourceRequestStatus } from './entities/resource-request.entity';
import { ResourceAllocation } from './entities/resource-allocation.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('ResourcesService — Phase 242-244', () => {
  let service: ResourcesService;
  let resourceRepo: any, requestRepo: any, allocRepo: any;

  beforeEach(async () => {
    resourceRepo = mockRepo(); requestRepo = mockRepo(); allocRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        ResourcesService,
        { provide: getRepositoryToken(ProjectResource), useValue: resourceRepo },
        { provide: getRepositoryToken(ResourceRequest), useValue: requestRepo },
        { provide: getRepositoryToken(ResourceAllocation), useValue: allocRepo },
      ],
    }).compile();
    service = module.get(ResourcesService);
  });

  // ─── Ph-242: pool ─────────────────────────────────────────────────

  it('createResource — rejects duplicate employee', async () => {
    resourceRepo.findOne.mockResolvedValue({ id: 'r1' });
    await expect(service.createResource('t1', { employeeId: 'e1', name: 'Dev' })).rejects.toThrow(BadRequestException);
  });

  it('findBySkill — matches active resources by skill and grade', async () => {
    resourceRepo.find.mockResolvedValue([
      { id: 'r1', isActive: true, skills: ['React', 'Node'], grade: 'SR' },
      { id: 'r2', isActive: true, skills: ['Java'], grade: 'SR' },
      { id: 'r3', isActive: false, skills: ['React'], grade: 'SR' },
    ]);
    const r = await service.findBySkill('t1', 'react', 'SR');
    expect(r.map((x) => x.id)).toEqual(['r1']);
  });

  // ─── Ph-243: requests ─────────────────────────────────────────────

  it('createRequest — requires positive hours', async () => {
    await expect(service.createRequest('t1', { projectId: 'p1', requestedBy: 'u1', skill: 'React', hoursNeeded: 0 })).rejects.toThrow(BadRequestException);
  });

  it('fulfillRequest — allocates a matching resource and marks FULFILLED', async () => {
    requestRepo.findOne.mockResolvedValue({ id: 'req1', status: ResourceRequestStatus.OPEN, skill: 'React', projectId: 'p1', hoursNeeded: 20, startWeek: '2026-W25' });
    resourceRepo.findOne.mockResolvedValue({ id: 'r1', skills: ['React'] });
    requestRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    allocRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.fulfillRequest('t1', 'req1', 'r1');
    expect(r.request.status).toBe(ResourceRequestStatus.FULFILLED);
    expect(r.allocation.allocatedHours).toBe(20);
  });

  it('fulfillRequest — rejects resource lacking the skill', async () => {
    requestRepo.findOne.mockResolvedValue({ id: 'req1', status: ResourceRequestStatus.OPEN, skill: 'React' });
    resourceRepo.findOne.mockResolvedValue({ id: 'r1', skills: ['Java'] });
    await expect(service.fulfillRequest('t1', 'req1', 'r1')).rejects.toThrow(BadRequestException);
  });

  it('fulfillRequest — rejects non-open request', async () => {
    requestRepo.findOne.mockResolvedValue({ id: 'req1', status: ResourceRequestStatus.FULFILLED });
    await expect(service.fulfillRequest('t1', 'req1', 'r1')).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-244: utilization ──────────────────────────────────────────

  it('allocate — rejects bad week format', async () => {
    await expect(service.allocate('t1', { resourceId: 'r1', projectId: 'p1', week: '2026-25', allocatedHours: 10 })).rejects.toThrow(BadRequestException);
  });

  it('utilization — computes util%, billable%, and flags', async () => {
    resourceRepo.find.mockResolvedValue([
      { id: 'r1', name: 'Over', isActive: true, weeklyCapacityHours: 40 },
      { id: 'r2', name: 'Under', isActive: true, weeklyCapacityHours: 40 },
    ]);
    allocRepo.find.mockResolvedValue([
      { resourceId: 'r1', allocatedHours: 45, billable: true },
      { resourceId: 'r2', allocatedHours: 10, billable: false },
    ]);
    const r = await service.utilization('t1', '2026-W25', 60);
    const over = r.resources.find((x: any) => x.resourceId === 'r1');
    const under = r.resources.find((x: any) => x.resourceId === 'r2');
    expect(over.utilizationPct).toBe(112.5);
    expect(over.flag).toBe('OVER');
    expect(under.flag).toBe('UNDER');
    expect(under.billablePct).toBe(0);
    expect(r.overAllocated).toBe(1);
    expect(r.underAllocated).toBe(1);
  });
});
