import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RfqService } from './rfq.service';
import { RfqStatus } from './entities/rfq.entity';

/**
 * RFQ lifecycle: DRAFT-only editing, issue → quotes → close → award, quote
 * upsert per vendor+line with vendor-responded stamping, the comparative
 * statement matrix, and award restricted to invited vendors.
 */
describe('RfqService', () => {
  let service: RfqService;
  let rfqRepo: any, lineRepo: any, vendorRepo: any, quoteRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'gen-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: '0' }),
    })),
  });

  beforeEach(() => {
    rfqRepo = mockRepo(); lineRepo = mockRepo(); vendorRepo = mockRepo(); quoteRepo = mockRepo();
    service = new RfqService(rfqRepo, lineRepo, vendorRepo, quoteRepo);
  });

  it('updateRfq only edits DRAFT and strips protected fields', async () => {
    rfqRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: RfqStatus.ISSUED });
    await expect(service.updateRfq('t1', 'r1', { title: 'X' })).rejects.toThrow(BadRequestException);

    const draft: any = { id: 'r1', tenantId: 't1', status: RfqStatus.DRAFT, rfqNumber: 'RFQ-000001' };
    rfqRepo.findOne.mockResolvedValue(draft);
    const r = await service.updateRfq('t1', 'r1', { title: 'New', status: RfqStatus.CLOSED, rfqNumber: 'HACK' });
    expect(r.title).toBe('New');
    expect(r.status).toBe(RfqStatus.DRAFT);
    expect(r.rfqNumber).toBe('RFQ-000001');
  });

  it('issueRfq requires DRAFT', async () => {
    rfqRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: RfqStatus.CLOSED });
    await expect(service.issueRfq('t1', 'r1')).rejects.toThrow(BadRequestException);
  });

  it('recordQuote computes the total, upserts per vendor+line, and marks the vendor responded', async () => {
    rfqRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1' });
    lineRepo.findOne.mockResolvedValue({ id: 'l1', rfqId: 'r1', quantity: 4 });
    quoteRepo.findOne.mockResolvedValue(null);
    const q = await service.recordQuote('t1', 'r1', { lineId: 'l1', vendorId: 'v1', unitPrice: 25.125 } as any);
    expect(q.totalPrice).toBe(100.5);
    expect(vendorRepo.update).toHaveBeenCalledWith(
      { rfqId: 'r1', vendorId: 'v1', tenantId: 't1' },
      expect.objectContaining({ responded: true }),
    );

    // second quote from the same vendor for the same line updates in place
    const existing: any = { id: 'q1', unitPrice: 30, totalPrice: 120 };
    quoteRepo.findOne.mockResolvedValue(existing);
    await service.recordQuote('t1', 'r1', { lineId: 'l1', vendorId: 'v1', unitPrice: 20 } as any);
    expect(existing.unitPrice).toBe(20);
    expect(quoteRepo.create).toHaveBeenCalledTimes(1); // not duplicated
  });

  it('comparativeStatement builds a line × vendor price matrix with gaps as null', async () => {
    rfqRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1' });
    lineRepo.find.mockResolvedValue([{ id: 'l1', description: 'Widget', quantity: 4 }]);
    vendorRepo.find.mockResolvedValue([{ vendorId: 'v1' }, { vendorId: 'v2' }]);
    quoteRepo.find.mockResolvedValue([{ lineId: 'l1', vendorId: 'v1', unitPrice: 25, totalPrice: 100 }]);
    const cs = await service.comparativeStatement('t1', 'r1');
    expect(cs.lines[0].vendors).toEqual([
      { vendorId: 'v1', unitPrice: 25, totalPrice: 100 },
      { vendorId: 'v2', unitPrice: null, totalPrice: null },
    ]);
  });

  it('awardRfq requires CLOSED and an invited vendor', async () => {
    rfqRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: RfqStatus.ISSUED });
    await expect(service.awardRfq('t1', 'r1', { vendorId: 'v1' } as any)).rejects.toThrow('Only CLOSED');

    rfqRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: RfqStatus.CLOSED });
    vendorRepo.findOne.mockResolvedValue(null); // not invited
    await expect(service.awardRfq('t1', 'r1', { vendorId: 'outsider' } as any)).rejects.toThrow('not part of this RFQ');

    const rfq: any = { id: 'r1', tenantId: 't1', status: RfqStatus.CLOSED };
    rfqRepo.findOne.mockResolvedValue(rfq);
    vendorRepo.findOne.mockResolvedValue({ vendorId: 'v1' });
    lineRepo.find.mockResolvedValue([]);
    vendorRepo.find.mockResolvedValue([]);
    quoteRepo.find.mockResolvedValue([]);
    await service.awardRfq('t1', 'r1', { vendorId: 'v1' } as any);
    expect(rfq.awardedVendorId).toBe('v1');
    expect(rfq.awardedAt).toBeInstanceOf(Date);
  });

  it('cancelRfq refuses CLOSED RFQs', async () => {
    rfqRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: RfqStatus.CLOSED });
    await expect(service.cancelRfq('t1', 'r1')).rejects.toThrow(BadRequestException);
    rfqRepo.findOne.mockResolvedValue(null);
    await expect(service.cancelRfq('t1', 'ghost')).rejects.toThrow(NotFoundException);
  });
});
