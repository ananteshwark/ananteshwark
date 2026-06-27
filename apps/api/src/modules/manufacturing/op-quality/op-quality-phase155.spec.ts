import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { OpQualityService } from './op-quality.service';
import { OperationQualityPlan } from './entities/operation-quality-plan.entity';
import { OperationQualityResult, QualityVerdict } from './entities/operation-quality-result.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
  remove: jest.fn(),
});

describe('OpQualityService — Phase 155-158', () => {
  let service: OpQualityService;
  let planRepo: any;
  let resultRepo: any;

  beforeEach(async () => {
    planRepo = mockRepo();
    resultRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        OpQualityService,
        { provide: getRepositoryToken(OperationQualityPlan), useValue: planRepo },
        { provide: getRepositoryToken(OperationQualityResult), useValue: resultRepo },
      ],
    }).compile();
    service = module.get(OpQualityService);
  });

  // ─── Ph-155 ───────────────────────────────────────────────────────

  it('createPlan — requires op + characteristic', async () => {
    await expect(service.createPlan('t1', { routingOperationId: '', characteristicName: 'X' })).rejects.toThrow(BadRequestException);
  });

  // ─── evaluate (spec window) ───────────────────────────────────────

  it('evaluate — within window passes', () => {
    const plan = { specMin: 10, specMax: 20 } as OperationQualityPlan;
    expect(service.evaluate(plan, 15)).toBe(QualityVerdict.PASS);
  });
  it('evaluate — below min / above max fails', () => {
    const plan = { specMin: 10, specMax: 20 } as OperationQualityPlan;
    expect(service.evaluate(plan, 5)).toBe(QualityVerdict.FAIL);
    expect(service.evaluate(plan, 25)).toBe(QualityVerdict.FAIL);
  });
  it('evaluate — null value fails', () => {
    expect(service.evaluate({ specMin: null, specMax: null } as OperationQualityPlan, null)).toBe(QualityVerdict.FAIL);
  });

  // ─── Ph-156: collection + gate ────────────────────────────────────

  it('collect — required failing characteristic blocks move', async () => {
    planRepo.find.mockResolvedValue([
      { characteristicName: 'Diameter', specMin: 10, specMax: 20, isRequired: true, blockOnFail: true },
      { characteristicName: 'Finish', specMin: null, specMax: null, isRequired: false, blockOnFail: false },
    ]);
    resultRepo.find.mockResolvedValue([]);
    resultRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.collect('t1', {
      productionOrderId: 'po1', routingOperationId: 'op1', workCenterId: 'wc1',
      measurements: [{ characteristicName: 'Diameter', measuredValue: 25 }, { characteristicName: 'Finish', measuredValue: 1 }],
    });
    expect(r.allPassed).toBe(false);
    expect(r.canProceed).toBe(false);
    expect(r.blockedBy).toContain('Diameter');
  });

  it('collect — all pass allows proceed', async () => {
    planRepo.find.mockResolvedValue([{ characteristicName: 'Diameter', specMin: 10, specMax: 20, isRequired: true, blockOnFail: true }]);
    resultRepo.find.mockResolvedValue([]);
    resultRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.collect('t1', { productionOrderId: 'po1', routingOperationId: 'op1', measurements: [{ characteristicName: 'Diameter', measuredValue: 15 }] });
    expect(r.canProceed).toBe(true);
    expect(r.allPassed).toBe(true);
  });

  it('collect — increments attempt number', async () => {
    planRepo.find.mockResolvedValue([{ characteristicName: 'D', specMin: 0, specMax: 10, isRequired: true, blockOnFail: true }]);
    resultRepo.find.mockResolvedValue([{ attemptNumber: 1 }, { attemptNumber: 2 }]);
    resultRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    await service.collect('t1', { productionOrderId: 'po1', routingOperationId: 'op1', measurements: [{ characteristicName: 'D', measuredValue: 5 }] });
    expect(resultRepo.create).toHaveBeenCalledWith(expect.objectContaining({ attemptNumber: 3 }));
  });

  it('collect — throws when no plan defined', async () => {
    planRepo.find.mockResolvedValue([]);
    await expect(service.collect('t1', { productionOrderId: 'po1', routingOperationId: 'op1', measurements: [] })).rejects.toThrow(BadRequestException);
  });

  it('canProceed — false when latest attempt has a failing required char', async () => {
    planRepo.find.mockResolvedValue([{ characteristicName: 'D', isRequired: true, blockOnFail: true }]);
    resultRepo.find.mockResolvedValue([
      { characteristicName: 'D', verdict: QualityVerdict.FAIL, attemptNumber: 1 },
      { characteristicName: 'D', verdict: QualityVerdict.FAIL, attemptNumber: 2 },
    ]);
    const r = await service.canProceed('t1', 'po1', 'op1');
    expect(r.canProceed).toBe(false);
  });

  it('canProceed — true when no blocking requirements', async () => {
    planRepo.find.mockResolvedValue([{ characteristicName: 'D', isRequired: false, blockOnFail: false }]);
    const r = await service.canProceed('t1', 'po1', 'op1');
    expect(r.canProceed).toBe(true);
  });

  // ─── Ph-158: first-pass yield ─────────────────────────────────────

  it('firstPassYield — computes FPY across operations', async () => {
    resultRepo.find.mockResolvedValue([
      // op A: passed first attempt
      { productionOrderId: 'po1', routingOperationId: 'opA', workCenterId: 'wc1', attemptNumber: 1, verdict: QualityVerdict.PASS },
      // op B: failed first attempt, passed second
      { productionOrderId: 'po1', routingOperationId: 'opB', workCenterId: 'wc1', attemptNumber: 1, verdict: QualityVerdict.FAIL },
      { productionOrderId: 'po1', routingOperationId: 'opB', workCenterId: 'wc1', attemptNumber: 2, verdict: QualityVerdict.PASS },
    ]);
    const fpy = await service.firstPassYield('t1', {});
    // 1 of 2 operations passed first → 50%
    expect(fpy.operationsTotal).toBe(2);
    expect(fpy.operationsPassedFirst).toBe(1);
    expect(fpy.firstPassYieldPct).toBe(50);
    expect(fpy.byWorkCenter[0]).toMatchObject({ workCenterId: 'wc1', firstPassYieldPct: 50 });
  });
});
