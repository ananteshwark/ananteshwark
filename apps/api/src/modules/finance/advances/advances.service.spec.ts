import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdvancesService } from './advances.service';
import { VendorAdvanceStatus } from './entities/vendor-advance.entity';
import { CustomerAdvanceStatus } from './entities/customer-advance.entity';

/**
 * Advances: vendor pay capped at the requested amount, clearing capped at the
 * remaining paid balance with PARTIALLY_CLEARED → CLEARED progression (both
 * sides), and the aging report showing only uncleared advances.
 */
describe('AdvancesService', () => {
  let service: AdvancesService;
  let vendorRepo: any, customerRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  });

  beforeEach(() => {
    vendorRepo = mockRepo(); customerRepo = mockRepo();
    service = new AdvancesService(vendorRepo, customerRepo);
  });

  it('payVendorAdvance caps the paid amount at the requested amount', async () => {
    vendorRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', amount: 100, paidAmount: 80, clearedAmount: 0, status: VendorAdvanceStatus.PAID });
    const a = await service.payVendorAdvance('t1', 'a1', { amount: 50 } as any);
    expect(a.paidAmount).toBe(100); // 80+50 capped at 100
    expect(a.status).toBe(VendorAdvanceStatus.PAID);
  });

  it('payVendorAdvance refuses an already-cleared advance', async () => {
    vendorRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', status: VendorAdvanceStatus.CLEARED });
    await expect(service.payVendorAdvance('t1', 'a1', {} as any)).rejects.toThrow(BadRequestException);
  });

  it('clearVendorAdvance requires payment first and caps at the paid balance', async () => {
    vendorRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', status: VendorAdvanceStatus.REQUESTED });
    await expect(service.clearVendorAdvance('t1', 'a1', { amount: 10 } as any)).rejects.toThrow('must be paid');

    vendorRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', status: VendorAdvanceStatus.PAID, paidAmount: 100, clearedAmount: 60 });
    await expect(service.clearVendorAdvance('t1', 'a1', { amount: 50 } as any)).rejects.toThrow('exceeds remaining');
  });

  it('vendor clearing progresses PARTIALLY_CLEARED → CLEARED', async () => {
    const adv: any = { id: 'a1', tenantId: 't1', status: VendorAdvanceStatus.PAID, paidAmount: 100, clearedAmount: 0 };
    vendorRepo.findOne.mockResolvedValue(adv);
    await service.clearVendorAdvance('t1', 'a1', { amount: 40, billId: 'b1' } as any);
    expect(adv.status).toBe(VendorAdvanceStatus.PARTIALLY_CLEARED);

    await service.clearVendorAdvance('t1', 'a1', { amount: 60, billId: 'b2' } as any);
    expect(adv.status).toBe(VendorAdvanceStatus.CLEARED);
    expect(adv.clearedAmount).toBe(100);
  });

  it('customer clearing caps at the advance amount and progresses to CLEARED', async () => {
    const adv: any = { id: 'c1', tenantId: 't1', amount: 200, clearedAmount: 150, status: CustomerAdvanceStatus.PARTIALLY_CLEARED };
    customerRepo.findOne.mockResolvedValue(adv);
    await expect(service.clearCustomerAdvance('t1', 'c1', { amount: 51 } as any)).rejects.toThrow('exceeds remaining');

    await service.clearCustomerAdvance('t1', 'c1', { amount: 50, invoiceId: 'i1' } as any);
    expect(adv.status).toBe(CustomerAdvanceStatus.CLEARED);
  });

  it('aging lists only uncleared advances and sums the exposure', async () => {
    vendorRepo.find.mockResolvedValue([
      { id: 'v1', paidAmount: 100, clearedAmount: 100, requestDate: '2026-01-01' }, // fully cleared → excluded
      { id: 'v2', paidAmount: 100, clearedAmount: 30, requestDate: '2026-06-01', paidDate: '2026-06-05' },
    ]);
    customerRepo.find.mockResolvedValue([
      { id: 'c1', amount: 500, clearedAmount: 200, receiptDate: '2026-05-01' },
    ]);
    const r = await service.aging('t1');
    expect(r.vendor).toHaveLength(1);
    expect(r.vendor[0].uncleared).toBe(70);
    expect(r.vendor[0].ageDays).toBeGreaterThan(0);
    expect(r.summary).toEqual({ vendorUncleared: 70, customerUncleared: 300 });
  });

  it('lookups are tenant-scoped 404s', async () => {
    await expect(service.payVendorAdvance('t2', 'x', {} as any)).rejects.toThrow(NotFoundException);
    expect(vendorRepo.findOne).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't2' } });
  });
});
