import { BadRequestException } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { PolicyStatus } from './policy.entity';
import { ProfileService } from '../../talent/profile/profile.service';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('PolicyService', () => {
  let service: PolicyService;
  let policyRepo: any, ackRepo: any, automation: any;

  beforeEach(() => {
    policyRepo = mockRepo(); ackRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new PolicyService(policyRepo, ackRepo, automation);
  });

  it('creates a DRAFT v1 policy and publishes it with an event', async () => {
    const created = await service.create('t1', 'admin1', { title: 'Leave Policy', body: 'Take leave.' });
    expect(created).toMatchObject({ version: 1, status: PolicyStatus.DRAFT });

    policyRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', title: 'Leave Policy', category: 'general', version: 1, status: PolicyStatus.DRAFT, requiresAck: true });
    const published = await service.publish('t1', 'p1');
    expect(published.status).toBe(PolicyStatus.PUBLISHED);
    expect(published.publishedAt).toBeInstanceOf(Date);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'policy.published', expect.objectContaining({ version: 1 }));
  });

  it('editing a published policy mints a new version and reverts to DRAFT', async () => {
    policyRepo.findOne.mockResolvedValue({
      id: 'p1', tenantId: 't1', title: 'Leave Policy', body: 'Old text', version: 2,
      status: PolicyStatus.PUBLISHED, requiresAck: true,
    });
    const updated = await service.update('t1', 'p1', { body: 'New revised text' });
    expect(updated.version).toBe(3);
    expect(updated.status).toBe(PolicyStatus.DRAFT);
    expect(updated.publishedAt).toBeNull();
  });

  it('metadata-only edits to a published policy do not bump the version', async () => {
    policyRepo.findOne.mockResolvedValue({
      id: 'p1', tenantId: 't1', title: 'Leave Policy', body: 'Text', version: 2,
      status: PolicyStatus.PUBLISHED, requiresAck: true,
    });
    const updated = await service.update('t1', 'p1', { category: 'hr-ops' });
    expect(updated.version).toBe(2);
    expect(updated.status).toBe(PolicyStatus.PUBLISHED);
  });

  describe('acknowledgement', () => {
    it('records a per-version acknowledgement, idempotently', async () => {
      policyRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', version: 3, status: PolicyStatus.PUBLISHED, requiresAck: true });
      ackRepo.findOne.mockResolvedValue(null);
      const ack = await service.acknowledge('t1', 'p1', { employeeId: 'e1', userId: 'u1' });
      expect(ack).toMatchObject({ policyId: 'p1', version: 3, employeeId: 'e1' });

      ackRepo.findOne.mockResolvedValue({ id: 'existing', version: 3 });
      const again = await service.acknowledge('t1', 'p1', { employeeId: 'e1', userId: 'u1' });
      expect(again.id).toBe('existing'); // idempotent
      expect(ackRepo.save).toHaveBeenCalledTimes(1);
    });

    it('rejects acknowledgement on unpublished or ack-free policies', async () => {
      policyRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', version: 1, status: PolicyStatus.DRAFT, requiresAck: true });
      await expect(service.acknowledge('t1', 'p1', { employeeId: 'e1', userId: 'u1' })).rejects.toThrow('Only published');

      policyRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', version: 1, status: PolicyStatus.PUBLISHED, requiresAck: false });
      await expect(service.acknowledge('t1', 'p1', { employeeId: 'e1', userId: 'u1' })).rejects.toThrow('does not require');
    });

    it('reports per-version acknowledgement status', async () => {
      policyRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', version: 3, status: PolicyStatus.PUBLISHED });
      ackRepo.findOne.mockResolvedValue({ id: 'a1' });
      expect(await service.acknowledgementStatus('t1', 'p1', 'e1')).toEqual({ version: 3, acknowledged: true });
    });
  });
});

describe('ProfileService — talent profile aggregate', () => {
  const mock = () => ({ find: jest.fn().mockResolvedValue([]), findOne: jest.fn() });

  it('assembles a snapshot from every wired source and summarises it', async () => {
    const employeeRepo: any = mock();
    employeeRepo.findOne.mockResolvedValue({
      id: 'e1', firstName: 'Asha', lastName: 'Rao', email: 'asha@x.com',
      departmentId: 'd1', designationId: 'des1', managerId: 'm1', dateOfJoining: '2022-01-01', status: 'ACTIVE',
    });
    const skillRepo: any = mock(); skillRepo.find.mockResolvedValue([{ skillId: 's1', proficiency: 4 }]);
    const objectiveRepo: any = mock(); objectiveRepo.find.mockResolvedValue([
      { id: 'o1', title: 'Ship v2', progress: 60, status: 'ON_TRACK' },
      { id: 'o2', title: 'Old goal', progress: 100, status: 'ACHIEVED' },
    ]);
    const recognitionRepo: any = mock(); recognitionRepo.find.mockResolvedValue([
      { badgeName: 'Star', fromName: 'Ben', points: 10, createdAt: new Date() },
      { badgeName: 'Helper', fromName: 'Cara', points: 5, createdAt: new Date() },
    ]);
    const idpRepo: any = mock(); idpRepo.find.mockResolvedValue([{ id: 'p1', title: 'Grow', status: 'ACTIVE' }]);
    const feedbackRepo: any = mock(); feedbackRepo.find.mockResolvedValue([{ kind: 'PRAISE', fromName: 'Ben', createdAt: new Date() }]);

    const service = new ProfileService(employeeRepo, skillRepo, objectiveRepo, recognitionRepo, idpRepo, feedbackRepo);
    const profile = await service.getProfile('t1', 'e1');
    expect(profile.employee.name).toBe('Asha Rao');
    expect(profile.summary).toEqual({ skillCount: 1, activeGoals: 1, recognitionPoints: 15, openDevelopmentPlans: 1 });
    expect(profile.recognition.points).toBe(15);
  });

  it('degrades gracefully when optional sources are absent', async () => {
    const employeeRepo: any = mock();
    employeeRepo.findOne.mockResolvedValue({ id: 'e1', firstName: 'Solo', lastName: '', status: 'ACTIVE' });
    const service = new ProfileService(employeeRepo);
    const profile = await service.getProfile('t1', 'e1');
    expect(profile.summary).toEqual({ skillCount: 0, activeGoals: 0, recognitionPoints: 0, openDevelopmentPlans: 0 });
  });
});
