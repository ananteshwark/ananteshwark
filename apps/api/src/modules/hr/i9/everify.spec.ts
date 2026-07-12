import { BadRequestException } from '@nestjs/common';
import { I9Service } from './i9.service';
import { EVerifyAdapter } from './everify.adapter';
import { I9Status, EVerifyResult } from './entities/i9-case.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

const pendingCase = (over: any = {}) => ({
  id: 'c1', tenantId: 't1', employeeId: 'e1', employeeName: 'Ann', hireDate: '2026-03-06',
  status: I9Status.EVERIFY_PENDING, section1: { citizenshipStatus: 'US_CITIZEN' }, section2: { documents: [] },
  everify: null, ...over,
});

describe('I9Service — live E-Verify seam', () => {
  let caseRepo: any, automation: any;

  beforeEach(() => {
    caseRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
  });

  it('reports submitted:false when no adapter is wired (manual path preserved)', async () => {
    const service = new I9Service(caseRepo, automation); // no adapter
    caseRepo.findOne.mockResolvedValue(pendingCase());
    const res = await service.submitToEVerify('t1', 'c1');
    expect(res.submitted).toBe(false);
    expect(res.reason).toMatch(/not wired/);
  });

  it('requires Sections 1 and 2 before submitting', async () => {
    const adapter = new EVerifyAdapter();
    const service = new I9Service(caseRepo, automation, adapter);
    caseRepo.findOne.mockResolvedValue(pendingCase({ section2: null }));
    await expect(service.submitToEVerify('t1', 'c1')).rejects.toThrow(BadRequestException);
  });

  it('applies an immediate EMPLOYMENT_AUTHORIZED result from the adapter', async () => {
    const adapter = new EVerifyAdapter();
    jest.spyOn(adapter, 'submitCase').mockResolvedValue({ submitted: true, caseNumber: 'EV-1', result: EVerifyResult.EMPLOYMENT_AUTHORIZED });
    const service = new I9Service(caseRepo, automation, adapter);
    caseRepo.findOne.mockResolvedValue(pendingCase());
    const res = await service.submitToEVerify('t1', 'c1');
    expect(res.submitted).toBe(true);
    expect(res.result).toBe(EVerifyResult.EMPLOYMENT_AUTHORIZED);
    expect(res.case.status).toBe(I9Status.COMPLETE);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'i9.completed', expect.objectContaining({ everify: true }));
  });

  it('stamps the case number and stays pending when the result is deferred', async () => {
    const adapter = new EVerifyAdapter();
    jest.spyOn(adapter, 'submitCase').mockResolvedValue({ submitted: true, caseNumber: 'EV-2' });
    const service = new I9Service(caseRepo, automation, adapter);
    caseRepo.findOne.mockResolvedValue(pendingCase());
    const res = await service.submitToEVerify('t1', 'c1');
    expect(res.submitted).toBe(true);
    expect(res.case.everify.caseNumber).toBe('EV-2');
    expect(res.case.status).toBe(I9Status.EVERIFY_PENDING);
  });

  it('refresh applies a later result and emits i9.everify_tnc on a tentative non-confirmation', async () => {
    const adapter = new EVerifyAdapter();
    jest.spyOn(adapter, 'checkStatus').mockResolvedValue({ result: EVerifyResult.TENTATIVE_NONCONFIRMATION });
    const service = new I9Service(caseRepo, automation, adapter);
    caseRepo.findOne.mockResolvedValue(pendingCase({ everify: { caseNumber: 'EV-3', submittedAt: '2026-03-07' } }));
    const res = await service.refreshEVerify('t1', 'c1');
    expect(res.result).toBe(EVerifyResult.TENTATIVE_NONCONFIRMATION);
    expect(res.case.status).toBe(I9Status.EVERIFY_PENDING); // TNC keeps it open
    expect(automation.emit).toHaveBeenCalledWith('t1', 'i9.everify_tnc', expect.objectContaining({ caseNumber: 'EV-3' }));
  });

  it('refresh returns a reason when no result is available yet', async () => {
    const adapter = new EVerifyAdapter(); // default checkStatus → no result
    const service = new I9Service(caseRepo, automation, adapter);
    caseRepo.findOne.mockResolvedValue(pendingCase({ everify: { caseNumber: 'EV-4', submittedAt: '2026-03-07' } }));
    const res = await service.refreshEVerify('t1', 'c1');
    expect(res.result).toBeUndefined();
    expect(res.reason).toMatch(/not wired|No result/);
  });
});
