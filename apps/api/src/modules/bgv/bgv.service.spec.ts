import { BadRequestException } from '@nestjs/common';
import { BgvService } from './bgv.service';
import {
  BgvCaseStatus, BgvCheckStatus, BgvCheckType, BgvResult, BgvSubjectType,
} from './entities/bgv.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => (Array.isArray(x) ? x : { id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  createQueryBuilder: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ max: null }),
  })),
});

describe('BgvService', () => {
  let service: BgvService;
  let caseRepo: any, checkRepo: any;
  const automation = { emit: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    caseRepo = mockRepo();
    checkRepo = mockRepo();
    automation.emit.mockClear();
    service = new BgvService(caseRepo, checkRepo, automation as any);
  });

  it('initiates a case with deduplicated checks', async () => {
    const { case: c } = await service.initiate('t1', 'hr1', {
      subjectType: BgvSubjectType.APPLICANT, subjectId: 'a1', subjectName: 'Ravi K',
      checkTypes: [BgvCheckType.IDENTITY, BgvCheckType.IDENTITY, BgvCheckType.EDUCATION],
    });
    expect(c.caseNumber).toBe('BGV-000001');
    // Duplicate IDENTITY collapsed → 2 checks created
    expect(checkRepo.save.mock.calls[0][0]).toHaveLength(2);
    await expect(service.initiate('t1', 'hr1', {
      subjectType: BgvSubjectType.EMPLOYEE, subjectId: 'e1', subjectName: 'X', checkTypes: [],
    })).rejects.toThrow('At least one check type');
  });

  it('first check update moves the case to IN_PROGRESS', async () => {
    checkRepo.findOne.mockResolvedValue({ id: 'k1', tenantId: 't1', caseId: 'c1', status: BgvCheckStatus.PENDING });
    caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', caseNumber: 'BGV-000001', status: BgvCaseStatus.INITIATED });
    checkRepo.find.mockResolvedValue([
      { status: BgvCheckStatus.CLEAR }, { status: BgvCheckStatus.PENDING },
    ]);
    const { case: c } = await service.updateCheck('t1', 'k1', 'hr1', { status: BgvCheckStatus.CLEAR });
    expect(c.status).toBe(BgvCaseStatus.IN_PROGRESS);
    expect(automation.emit).not.toHaveBeenCalled(); // not complete yet
  });

  it('completes with worst-of outcome and emits bgv.completed', async () => {
    checkRepo.findOne.mockResolvedValue({ id: 'k1', tenantId: 't1', caseId: 'c1', status: BgvCheckStatus.PENDING });
    caseRepo.findOne.mockResolvedValue({
      id: 'c1', tenantId: 't1', caseNumber: 'BGV-000002', status: BgvCaseStatus.IN_PROGRESS,
      subjectType: BgvSubjectType.APPLICANT, subjectId: 'a1', subjectName: 'Ravi K',
    });
    checkRepo.find.mockResolvedValue([
      { status: BgvCheckStatus.CLEAR },
      { status: BgvCheckStatus.DISCREPANCY },
    ]);
    const { case: c } = await service.updateCheck('t1', 'k1', 'hr1', {
      status: BgvCheckStatus.DISCREPANCY, remarks: 'Dates mismatch at prior employer',
    });
    expect(c.status).toBe(BgvCaseStatus.COMPLETED);
    expect(c.overallResult).toBe(BgvResult.DISCREPANCY);
    expect(c.completedAt).toBeInstanceOf(Date);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'bgv.completed', expect.objectContaining({
      caseNumber: 'BGV-000002', overallResult: BgvResult.DISCREPANCY,
    }));
  });

  it('any FAILED check fails the whole case', async () => {
    checkRepo.findOne.mockResolvedValue({ id: 'k1', tenantId: 't1', caseId: 'c1', status: BgvCheckStatus.PENDING });
    caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', caseNumber: 'BGV-000003', status: BgvCaseStatus.IN_PROGRESS });
    checkRepo.find.mockResolvedValue([
      { status: BgvCheckStatus.CLEAR }, { status: BgvCheckStatus.FAILED }, { status: BgvCheckStatus.DISCREPANCY },
    ]);
    const { case: c } = await service.updateCheck('t1', 'k1', 'hr1', { status: BgvCheckStatus.FAILED });
    expect(c.overallResult).toBe(BgvResult.FAILED);
  });

  it('freezes checks once the case is completed or cancelled', async () => {
    checkRepo.findOne.mockResolvedValue({ id: 'k1', tenantId: 't1', caseId: 'c1' });
    caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', caseNumber: 'BGV-000004', status: BgvCaseStatus.COMPLETED });
    await expect(service.updateCheck('t1', 'k1', 'hr1', { status: BgvCheckStatus.CLEAR }))
      .rejects.toThrow('checks are frozen');
    caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: BgvCaseStatus.COMPLETED });
    await expect(service.cancel('t1', 'c1')).rejects.toThrow(BadRequestException);
  });
});
