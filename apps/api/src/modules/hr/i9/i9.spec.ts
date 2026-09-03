import { BadRequestException } from '@nestjs/common';
import { I9Service } from './i9.service';
import { I9Status, CitizenshipStatus, EVerifyResult } from './entities/i9-case.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('I9Service', () => {
  let service: I9Service;
  let caseRepo: any, automation: any;

  beforeEach(() => {
    caseRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new I9Service(caseRepo, automation);
  });

  it('opens a case with the Section 2 deadline set 3 business days after hire', async () => {
    caseRepo.findOne.mockResolvedValue(null);
    // Fri 2026-03-06 + 3 business days = Wed 2026-03-11 (skips Sat/Sun).
    const kase = await service.createCase('t1', { employeeId: 'e1', employeeName: 'Ann', hireDate: '2026-03-06' });
    expect(kase.section2DueDate).toBe('2026-03-11');
    expect(kase.status).toBe(I9Status.SECTION1_PENDING);
  });

  it('rejects a duplicate case', async () => {
    caseRepo.findOne.mockResolvedValue({ id: 'x' });
    await expect(service.createCase('t1', { employeeId: 'e1', employeeName: 'Ann', hireDate: '2026-03-06' })).rejects.toThrow(BadRequestException);
  });

  describe('Section 1', () => {
    it('advances to SECTION2_PENDING for a US citizen', async () => {
      caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: I9Status.SECTION1_PENDING });
      const kase = await service.completeSection1('t1', 'c1', { citizenshipStatus: CitizenshipStatus.US_CITIZEN });
      expect(kase.status).toBe(I9Status.SECTION2_PENDING);
      expect(kase.section1!.citizenshipStatus).toBe(CitizenshipStatus.US_CITIZEN);
    });

    it('requires a work-auth expiry for alien-authorized status', async () => {
      caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: I9Status.SECTION1_PENDING });
      await expect(service.completeSection1('t1', 'c1', { citizenshipStatus: CitizenshipStatus.ALIEN_AUTHORIZED })).rejects.toThrow(BadRequestException);
    });
  });

  describe('Section 2 document combinations', () => {
    const base = () => ({ id: 'c1', tenantId: 't1', employeeId: 'e1', status: I9Status.SECTION2_PENDING, everifyEnabled: false, section1: null });

    it('accepts a single List A document and completes when E-Verify is off', async () => {
      caseRepo.findOne.mockResolvedValue(base());
      const kase = await service.completeSection2('t1', 'c1', { documents: [{ list: 'A', title: 'US Passport' }], verifiedByUserId: 'hr1' });
      expect(kase.status).toBe(I9Status.COMPLETE);
      expect(automation.emit).toHaveBeenCalledWith('t1', 'i9.completed', expect.objectContaining({ everify: false }));
    });

    it('accepts List B + List C', async () => {
      caseRepo.findOne.mockResolvedValue(base());
      const kase = await service.completeSection2('t1', 'c1', { documents: [{ list: 'B', title: 'Driver License' }, { list: 'C', title: 'SSN Card' }], verifiedByUserId: 'hr1' });
      expect(kase.status).toBe(I9Status.COMPLETE);
    });

    it('rejects List A + List B together', async () => {
      caseRepo.findOne.mockResolvedValue(base());
      await expect(service.completeSection2('t1', 'c1', { documents: [{ list: 'A', title: 'Passport' }, { list: 'B', title: 'License' }], verifiedByUserId: 'hr1' })).rejects.toThrow(BadRequestException);
    });

    it('rejects a lone List B document', async () => {
      caseRepo.findOne.mockResolvedValue(base());
      await expect(service.completeSection2('t1', 'c1', { documents: [{ list: 'B', title: 'License' }], verifiedByUserId: 'hr1' })).rejects.toThrow(BadRequestException);
    });

    it('routes to EVERIFY_PENDING when E-Verify is enabled', async () => {
      caseRepo.findOne.mockResolvedValue({ ...base(), everifyEnabled: true });
      const kase = await service.completeSection2('t1', 'c1', { documents: [{ list: 'A', title: 'Passport' }], verifiedByUserId: 'hr1' });
      expect(kase.status).toBe(I9Status.EVERIFY_PENDING);
    });

    it('captures the earliest expiry as the reverification date', async () => {
      caseRepo.findOne.mockResolvedValue(base());
      const kase = await service.completeSection2('t1', 'c1', { documents: [{ list: 'A', title: 'EAD', expiry: '2027-01-01' }], verifiedByUserId: 'hr1' });
      expect(kase.reverificationDate).toBe('2027-01-01');
    });
  });

  describe('E-Verify', () => {
    it('completes the case on EMPLOYMENT_AUTHORIZED', async () => {
      caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', employeeId: 'e1', status: I9Status.EVERIFY_PENDING });
      const kase = await service.recordEVerify('t1', 'c1', { caseNumber: 'EV123', result: EVerifyResult.EMPLOYMENT_AUTHORIZED });
      expect(kase.status).toBe(I9Status.COMPLETE);
      expect(automation.emit).toHaveBeenCalledWith('t1', 'i9.completed', expect.objectContaining({ everify: true }));
    });

    it('keeps the case pending on a tentative non-confirmation', async () => {
      caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: I9Status.EVERIFY_PENDING });
      const kase = await service.recordEVerify('t1', 'c1', { caseNumber: 'EV123', result: EVerifyResult.TENTATIVE_NONCONFIRMATION });
      expect(kase.status).toBe(I9Status.EVERIFY_PENDING);
    });
  });

  it('lists cases due for reverification on/before a date', async () => {
    caseRepo.find.mockResolvedValue([
      { id: 'a', reverificationDate: '2026-06-01' },
      { id: 'b', reverificationDate: '2027-01-01' },
      { id: 'c', reverificationDate: null },
    ]);
    const due = await service.dueForReverification('t1', '2026-07-10');
    expect(due.map((k) => k.id)).toEqual(['a']);
  });
});
