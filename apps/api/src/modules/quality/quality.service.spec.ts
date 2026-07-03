import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QualityService } from './quality.service';
import { InspectionLotStatus, UsageDecision } from './entities/inspection-lot.entity';
import { NcrStatus } from './entities/non-conformance.entity';

/**
 * Quality flows: lot numbering, results recording (accept/reject decisions,
 * no double-recording), and the NCR resolve → close lifecycle.
 */
describe('QualityService', () => {
  let service: QualityService;
  let planRepo: any, lotRepo: any, ncrRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x) => Promise.resolve(x)),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ mx: 3 }),
    })),
  });

  beforeEach(() => {
    planRepo = mockRepo(); lotRepo = mockRepo(); ncrRepo = mockRepo();
    service = new QualityService(planRepo, lotRepo, ncrRepo);
  });

  it('createLot numbers sequentially per tenant', async () => {
    await service.createLot('t1', { itemId: 'i1', quantity: 10 } as any);
    expect(lotRepo.create).toHaveBeenCalledWith(expect.objectContaining({ lotNumber: 'QM-LOT-000004', tenantId: 't1' }));
  });

  it('recordResults ACCEPT passes the lot, REJECT fails it', async () => {
    lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', status: InspectionLotStatus.PENDING });
    const passed = await service.recordResults('t1', 'l1', { results: [], usageDecision: UsageDecision.ACCEPT } as any);
    expect(passed.status).toBe(InspectionLotStatus.PASSED);

    lotRepo.findOne.mockResolvedValue({ id: 'l2', tenantId: 't1', status: InspectionLotStatus.PENDING });
    const failed = await service.recordResults('t1', 'l2', { results: [], usageDecision: UsageDecision.REJECT } as any);
    expect(failed.status).toBe(InspectionLotStatus.FAILED);
  });

  it('recordResults refuses to overwrite a decided lot', async () => {
    lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', status: InspectionLotStatus.PASSED });
    await expect(
      service.recordResults('t1', 'l1', { results: [], usageDecision: UsageDecision.ACCEPT } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('createNcr numbers NCRs and resolveNcr stamps root cause + timestamp', async () => {
    await service.createNcr('t1', { description: 'defect' } as any);
    expect(ncrRepo.create).toHaveBeenCalledWith(expect.objectContaining({ ncrNumber: 'NCR-000004' }));

    ncrRepo.findOne.mockResolvedValue({ id: 'n1', tenantId: 't1', status: NcrStatus.OPEN });
    const r = await service.resolveNcr('t1', 'n1', { rootCause: 'wear', correctiveAction: 'replace' } as any);
    expect(r.status).toBe(NcrStatus.RESOLVED);
    expect(r.resolvedAt).toBeInstanceOf(Date);
  });

  it('closeNcr requires RESOLVED first', async () => {
    ncrRepo.findOne.mockResolvedValue({ id: 'n1', tenantId: 't1', status: NcrStatus.OPEN });
    await expect(service.closeNcr('t1', 'n1')).rejects.toThrow(BadRequestException);

    ncrRepo.findOne.mockResolvedValue({ id: 'n1', tenantId: 't1', status: NcrStatus.RESOLVED });
    const c = await service.closeNcr('t1', 'n1');
    expect(c.status).toBe(NcrStatus.CLOSED);
  });

  it('lookups are tenant-scoped and 404 when missing', async () => {
    await expect(service.findPlan('t1', 'x')).rejects.toThrow(NotFoundException);
    await expect(service.findLot('t1', 'x')).rejects.toThrow(NotFoundException);
    await expect(service.resolveNcr('t1', 'x', {} as any)).rejects.toThrow(NotFoundException);
    expect(planRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: 't1', id: 'x' } });
  });
});
