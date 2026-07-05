import { BadRequestException } from '@nestjs/common';
import { HelpdeskService } from './helpdesk.service';
import { HrCaseCategory, HrCasePriority, HrCaseStatus } from './entities/hr-case.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  createQueryBuilder: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ max: '41' }),
  })),
});

describe('HelpdeskService', () => {
  let service: HelpdeskService;
  let caseRepo: any, commentRepo: any;
  const automation = { emit: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    caseRepo = mockRepo();
    commentRepo = mockRepo();
    automation.emit.mockClear();
    service = new HelpdeskService(caseRepo, commentRepo, automation as any);
  });

  it('creates numbered cases with priority-based SLA and emits hr_case.created', async () => {
    const before = Date.now();
    await service.createCase('t1', 'u1', {
      subject: 'Payslip missing', description: 'March payslip not visible',
      category: HrCaseCategory.PAYROLL, priority: HrCasePriority.URGENT,
    });
    const created = caseRepo.create.mock.calls[0][0];
    expect(created.caseNumber).toBe('HRC-000042');
    // URGENT = 4h SLA
    const slaMs = created.slaDueAt.getTime() - before;
    expect(slaMs).toBeGreaterThan(3.9 * 3600_000);
    expect(slaMs).toBeLessThan(4.1 * 3600_000);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'hr_case.created', expect.objectContaining({
      caseNumber: 'HRC-000042', priority: HrCasePriority.URGENT,
    }));
  });

  it('grievances are forced confidential', async () => {
    await service.createCase('t1', 'u1', {
      subject: 'Complaint', description: 'x', category: HrCaseCategory.GRIEVANCE, confidential: false,
    });
    expect(caseRepo.create.mock.calls[0][0].confidential).toBe(true);
  });

  it('resolving requires notes, stamps resolvedAt, and emits hr_case.resolved', async () => {
    caseRepo.findOne.mockResolvedValue({
      id: 'c1', tenantId: 't1', caseNumber: 'HRC-000001', subject: 'S',
      category: HrCaseCategory.LEAVE, status: HrCaseStatus.IN_PROGRESS, employeeId: 'e1',
    });
    await expect(service.updateStatus('t1', 'c1', HrCaseStatus.RESOLVED))
      .rejects.toThrow('Resolution notes are required');
    const saved = await service.updateStatus('t1', 'c1', HrCaseStatus.RESOLVED, 'Balance corrected');
    expect(saved.resolvedAt).toBeInstanceOf(Date);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'hr_case.resolved', expect.objectContaining({ caseNumber: 'HRC-000001' }));
  });

  it('blocks invalid transitions (closed is terminal)', async () => {
    caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: HrCaseStatus.CLOSED });
    await expect(service.updateStatus('t1', 'c1', HrCaseStatus.IN_PROGRESS)).rejects.toThrow(BadRequestException);
  });

  it('assignment moves OPEN cases to IN_PROGRESS', async () => {
    caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: HrCaseStatus.OPEN });
    const saved = await service.assign('t1', 'c1', 'hr-agent-1');
    expect(saved.assignedToId).toBe('hr-agent-1');
    expect(saved.status).toBe(HrCaseStatus.IN_PROGRESS);
  });

  it('internal comments are hidden from the requester view', async () => {
    caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: HrCaseStatus.OPEN });
    commentRepo.find.mockResolvedValue([
      { id: 'm1', body: 'public reply', internal: false },
      { id: 'm2', body: 'internal note', internal: true },
    ]);
    const requesterView = await service.listComments('t1', 'c1', false);
    expect(requesterView.map(c => c.id)).toEqual(['m1']);
    const hrView = await service.listComments('t1', 'c1', true);
    expect(hrView).toHaveLength(2);
  });
});
