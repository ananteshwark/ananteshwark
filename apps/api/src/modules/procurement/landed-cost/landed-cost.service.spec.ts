import { BadRequestException } from '@nestjs/common';
import { LandedCostService } from './landed-cost.service';
import { AllocationBasis, LandedCostStatus } from './landed-cost.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
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

describe('LandedCostService', () => {
  let service: LandedCostService;
  let docRepo: any, grnRepo: any, grnLineRepo: any, poLineRepo: any;

  beforeEach(() => {
    docRepo = mockRepo(); grnRepo = mockRepo(); grnLineRepo = mockRepo(); poLineRepo = mockRepo();
    service = new LandedCostService(docRepo, grnRepo, grnLineRepo, poLineRepo);
  });

  describe('allocation math', () => {
    const lines = [
      { grnLineId: 'l1', description: 'Steel', quantityAccepted: 100, unitPrice: 50 },  // value 5000
      { grnLineId: 'l2', description: 'Bolts', quantityAccepted: 300, unitPrice: 10 },  // value 3000
      { grnLineId: 'l3', description: 'Paint', quantityAccepted: 20, unitPrice: 100 },  // value 2000
    ];

    it('allocates by VALUE proportionally and sums exactly to the charge total', () => {
      const allocations = service.allocate(lines, 1000, AllocationBasis.VALUE);
      expect(allocations.map((a) => a.allocatedAmount)).toEqual([500, 300, 200]);
      expect(allocations[0].unitCostDelta).toBe(5); // 500 / 100 units
      const sum = allocations.reduce((s, a) => s + a.allocatedAmount, 0);
      expect(sum).toBe(1000);
    });

    it('allocates by QUANTITY when asked', () => {
      const allocations = service.allocate(lines, 840, AllocationBasis.QUANTITY);
      // 420 total units → 2 per unit
      expect(allocations.map((a) => a.allocatedAmount)).toEqual([200, 600, 40]);
    });

    it('the last line absorbs rounding so totals always reconcile', () => {
      const awkward = [
        { grnLineId: 'a', description: 'A', quantityAccepted: 1, unitPrice: 1 },
        { grnLineId: 'b', description: 'B', quantityAccepted: 1, unitPrice: 1 },
        { grnLineId: 'c', description: 'C', quantityAccepted: 1, unitPrice: 1 },
      ];
      const allocations = service.allocate(awkward, 100, AllocationBasis.VALUE);
      const sum = allocations.reduce((s, a) => s + a.allocatedAmount, 0);
      expect(Math.round(sum * 100) / 100).toBe(100); // 33.33 + 33.33 + 33.34
      expect(allocations[2].allocatedAmount).toBe(33.34);
    });

    it('skips fully rejected lines and refuses when nothing was accepted', () => {
      const withRejected = [...lines, { grnLineId: 'l4', description: 'Rejected', quantityAccepted: 0, unitPrice: 99 }];
      expect(service.allocate(withRejected, 100, AllocationBasis.VALUE)).toHaveLength(3);
      expect(() => service.allocate(
        [{ grnLineId: 'x', description: 'X', quantityAccepted: 0, unitPrice: 1 }], 100, AllocationBasis.VALUE,
      )).toThrow('No accepted quantities');
    });
  });

  it('create loads GRN + PO lines, computes allocations, numbers the document', async () => {
    grnRepo.findOne.mockResolvedValue({ id: 'grn-1', tenantId: 't1', grnNumber: 'GRN-000007', poId: 'po-1' });
    grnLineRepo.find.mockResolvedValue([
      { id: 'gl1', lineNumber: 1, poLineId: 'pl1', quantityAccepted: 10 },
      { id: 'gl2', lineNumber: 2, poLineId: 'pl2', quantityAccepted: 5 },
    ]);
    poLineRepo.find.mockResolvedValue([
      { id: 'pl1', description: 'Machine part', unitPrice: 200 }, // value 2000
      { id: 'pl2', description: 'Fasteners', unitPrice: 400 },    // value 2000
    ]);
    const doc = await service.create('t1', {
      grnId: 'grn-1',
      charges: [
        { type: 'FREIGHT', amount: 300 },
        { type: 'DUTY', amount: 100 },
      ],
    });
    expect(doc.docNumber).toBe('LC-000001');
    expect(doc.totalCharges).toBe(400);
    expect(doc.allocations.map((a: any) => a.allocatedAmount)).toEqual([200, 200]);
    expect(doc.allocations[1].unitCostDelta).toBe(40); // 200 / 5 units
    expect(doc.status).toBe(LandedCostStatus.DRAFT);
  });

  it('rejects empty or non-positive charge lists', async () => {
    await expect(service.create('t1', { grnId: 'g', charges: [] }))
      .rejects.toThrow('At least one charge');
    await expect(service.create('t1', { grnId: 'g', charges: [{ type: 'FREIGHT', amount: 0 }] }))
      .rejects.toThrow(BadRequestException);
  });

  it('post freezes DRAFT docs; posted docs cannot be cancelled', async () => {
    docRepo.findOne.mockResolvedValue({ id: 'd1', tenantId: 't1', status: LandedCostStatus.DRAFT });
    const posted = await service.post('t1', 'd1');
    expect(posted.status).toBe(LandedCostStatus.POSTED);
    expect(posted.postedAt).toBeInstanceOf(Date);

    docRepo.findOne.mockResolvedValue({ id: 'd1', tenantId: 't1', status: LandedCostStatus.POSTED });
    await expect(service.post('t1', 'd1')).rejects.toThrow('Only DRAFT');
    await expect(service.cancel('t1', 'd1')).rejects.toThrow('cannot be cancelled');
  });
});
