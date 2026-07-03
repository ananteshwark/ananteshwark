import { NotFoundException } from '@nestjs/common';
import { QmResultsService } from './qm-results.service';
import { InspectionLotStatus, UsageDecision } from './entities/inspection-lot.entity';
import { CharacteristicType } from './entities/quality-characteristic.entity';
import { ResultVerdict } from './entities/inspection-result.entity';
import { NcrStatus } from './entities/non-conformance.entity';

/**
 * Results recording against characteristics: measured-value verdict derivation
 * (limits + target tolerance), lot pass/fail rollup, and auto-NCR on a REJECT
 * usage decision.
 */
describe('QmResultsService', () => {
  let service: QmResultsService;
  let planRepo: any, lotRepo: any, ncrRepo: any, charRepo: any, resultRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    remove: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ mx: 0 }),
    })),
  });

  beforeEach(() => {
    planRepo = mockRepo(); lotRepo = mockRepo(); ncrRepo = mockRepo();
    charRepo = mockRepo(); resultRepo = mockRepo();
    service = new QmResultsService(planRepo, lotRepo, ncrRepo, charRepo, resultRepo);
  });

  const measuredChar = (over: any = {}) => ({
    id: 'ch1', name: 'Diameter', type: CharacteristicType.MEASURED,
    lowerLimit: 9, upperLimit: 11, target: 10, ...over,
  });

  it('recordResults passes an in-limits measurement and fails an out-of-limits one', async () => {
    lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', planId: 'p1' });
    charRepo.find.mockResolvedValue([measuredChar()]);
    resultRepo.find.mockResolvedValue([]); // rollup read

    await service.recordResults('t1', 'l1', { results: [{ characteristicId: 'ch1', measuredValue: 10.5 }] } as any, 'u1');
    expect(resultRepo.save).toHaveBeenCalledWith(expect.objectContaining({ verdict: ResultVerdict.PASS }));

    await service.recordResults('t1', 'l1', { results: [{ characteristicId: 'ch1', measuredValue: 12 }] } as any, 'u1');
    expect(resultRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ verdict: ResultVerdict.FAIL }));
  });

  it('uses a 1% target tolerance when no limits are defined', async () => {
    lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', planId: 'p1' });
    charRepo.find.mockResolvedValue([measuredChar({ lowerLimit: null, upperLimit: null, target: 100 })]);
    resultRepo.find.mockResolvedValue([]);

    await service.recordResults('t1', 'l1', { results: [{ characteristicId: 'ch1', measuredValue: 100.9 }] } as any);
    expect(resultRepo.save).toHaveBeenCalledWith(expect.objectContaining({ verdict: ResultVerdict.PASS }));

    await service.recordResults('t1', 'l1', { results: [{ characteristicId: 'ch1', measuredValue: 102 }] } as any);
    expect(resultRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ verdict: ResultVerdict.FAIL }));
  });

  it('rolls the lot status up from the recorded verdicts', async () => {
    lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', planId: 'p1' });
    charRepo.find.mockResolvedValue([measuredChar()]);
    resultRepo.find.mockResolvedValue([{ verdict: ResultVerdict.PASS }, { verdict: ResultVerdict.FAIL }]);
    await service.recordResults('t1', 'l1', { results: [{ characteristicId: 'ch1', measuredValue: 10 }] } as any);
    expect(lotRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: InspectionLotStatus.FAILED }));
  });

  it('rejects results for a characteristic outside the lot plan', async () => {
    lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', planId: 'p1' });
    charRepo.find.mockResolvedValue([]);
    await expect(
      service.recordResults('t1', 'l1', { results: [{ characteristicId: 'ghost', measuredValue: 1 }] } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('setUsageDecision REJECT fails the lot and opens a HIGH-severity NCR', async () => {
    lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', lotNumber: 'QM-LOT-000001', itemCode: 'ITM-1' });
    const { lot, ncr } = await service.setUsageDecision('t1', 'l1', { decision: UsageDecision.REJECT, notes: 'cracks' } as any, 'u1');
    expect(lot.status).toBe(InspectionLotStatus.FAILED);
    expect(ncr).not.toBeNull();
    expect(ncrRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      ncrNumber: 'NCR-000001', status: NcrStatus.OPEN, inspectionLotId: 'l1',
    }));
  });

  it('setUsageDecision ACCEPT passes the lot and opens no NCR', async () => {
    lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', lotNumber: 'QM-LOT-000001' });
    const { lot, ncr } = await service.setUsageDecision('t1', 'l1', { decision: UsageDecision.ACCEPT } as any);
    expect(lot.status).toBe(InspectionLotStatus.PASSED);
    expect(ncr).toBeNull();
  });
});
