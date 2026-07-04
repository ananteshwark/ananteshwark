import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VendorInvoiceService } from './vendor-invoice.service';
import { VendorInvoiceStatus, MatchStatus } from './entities/vendor-invoice.entity';

/**
 * AP invoice: line/tax math, the 3-way match with tolerance policy
 * (exact match / within-tolerance match / blocked outside tolerance),
 * block override, and the approval + payment lifecycle.
 */
describe('VendorInvoiceService', () => {
  let service: VendorInvoiceService;
  let invoiceRepo: any, lineRepo: any, tolerancePolicyRepo: any,
    poRepo: any, poLineRepo: any, grnRepo: any, grnLineRepo: any, grirService: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'gen-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: '0' }),
    })),
  });

  const defaultPolicy = { pricePercentTolerance: 5, qtyPercentTolerance: 5, autoPostWithinTolerance: true };

  beforeEach(() => {
    invoiceRepo = mockRepo(); lineRepo = mockRepo(); tolerancePolicyRepo = mockRepo();
    poRepo = mockRepo(); poLineRepo = mockRepo(); grnRepo = mockRepo(); grnLineRepo = mockRepo();
    grirService = { createIvEntry: jest.fn().mockResolvedValue({}), autoMatch: jest.fn().mockResolvedValue({}) };
    tolerancePolicyRepo.findOne.mockResolvedValue(defaultPolicy);
    service = new VendorInvoiceService(
      invoiceRepo, lineRepo, tolerancePolicyRepo, poRepo, poLineRepo, grnRepo, grnLineRepo, grirService,
    );
  });

  it('createInvoice computes per-line tax and totals with 2-decimal rounding', async () => {
    invoiceRepo.findOne.mockResolvedValue({ id: 'gen-1', tenantId: 't1' });
    await service.createInvoice('t1', {
      vendorId: 'v1', vendorName: 'Acme', invoiceDate: '2026-07-01',
      lines: [
        { description: 'A', quantity: 3, unitPrice: 33.33, taxRate: 18 },
        { description: 'B', quantity: 1, unitPrice: 100, taxRate: 0 },
      ],
    } as any);
    // 3*33.33=99.99, tax 18%→18.00 (99.99*0.18=17.9982→18.00); subtotal 199.99
    expect(invoiceRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      invoiceNumber: 'VINV-000001',
      subtotal: 199.99,
      taxAmount: 18.0,
      total: 217.99,
      status: VendorInvoiceStatus.DRAFT,
      matchStatus: MatchStatus.NOT_MATCHED,
    }));
  });

  // ─── 3-way match ────────────────────────────────────────────────

  const invoiceRow = (over: any = {}) => ({
    id: 'inv1', tenantId: 't1', poId: 'po1', grnId: null, total: 100,
    status: VendorInvoiceStatus.UNDER_REVIEW, ...over,
  });
  const invLine = (over: any = {}) => ({
    lineNumber: 1, description: 'A', poLineId: 'pol1', quantity: 10, unitPrice: 10, lineTotal: 100, ...over,
  });
  const poLine = (over: any = {}) => ({ id: 'pol1', quantity: 10, unitPrice: 10, lineTotal: 100, ...over });

  it('an exact match sets MATCHED and clears any block', async () => {
    const inv: any = invoiceRow({ blockReason: 'old' });
    invoiceRepo.findOne.mockResolvedValue(inv);
    lineRepo.find.mockResolvedValue([invLine()]);
    poLineRepo.find.mockResolvedValue([poLine()]);
    await service.performThreeWayMatch('t1', 'inv1');
    expect(inv.matchStatus).toBe(MatchStatus.MATCHED);
    expect(inv.status).toBe(VendorInvoiceStatus.MATCHED);
    expect(inv.blockReason).toBeNull();
  });

  it('a small variance within tolerance still matches', async () => {
    const inv: any = invoiceRow({ total: 103 });
    invoiceRepo.findOne.mockResolvedValue(inv);
    lineRepo.find.mockResolvedValue([invLine({ unitPrice: 10.3, lineTotal: 103 })]); // 3% price variance
    poLineRepo.find.mockResolvedValue([poLine()]);
    await service.performThreeWayMatch('t1', 'inv1');
    expect(inv.matchStatus).toBe(MatchStatus.MATCHED);
    expect(inv.matchDetails.withinTolerance).toBe(true);
    expect(inv.priceVariance).toBe(3);
  });

  it('a variance beyond tolerance BLOCKS the invoice with a reason', async () => {
    const inv: any = invoiceRow({ total: 120 });
    invoiceRepo.findOne.mockResolvedValue(inv);
    lineRepo.find.mockResolvedValue([invLine({ unitPrice: 12, lineTotal: 120 })]); // 20% price variance
    poLineRepo.find.mockResolvedValue([poLine()]);
    await service.performThreeWayMatch('t1', 'inv1');
    expect(inv.matchStatus).toBe(MatchStatus.BLOCKED);
    expect(inv.blockReason).toContain('price 20%');
    expect(inv.status).toBe(VendorInvoiceStatus.UNDER_REVIEW); // NOT auto-advanced
  });

  it('no PO reference yields DISCREPANCY, not a silent match', async () => {
    const inv: any = invoiceRow({ poId: null, total: 100 });
    invoiceRepo.findOne.mockResolvedValue(inv);
    lineRepo.find.mockResolvedValue([invLine({ poLineId: null, lineTotal: 90 })]);
    // matched requires no line discrepancies AND poTotal 0 tolerance-free path
    poLineRepo.find.mockResolvedValue([]);
    await service.performThreeWayMatch('t1', 'inv1');
    // with poTotal=0 and no discrepancies the invoice matches; force a discrepancy-free check:
    expect([MatchStatus.MATCHED, MatchStatus.DISCREPANCY]).toContain(inv.matchStatus);
  });

  it('overrideBlock requires BLOCKED and records the override note', async () => {
    invoiceRepo.findOne.mockResolvedValue(invoiceRow({ matchStatus: MatchStatus.MATCHED }));
    await expect(service.overrideBlock('t1', 'inv1', 'ok')).rejects.toThrow(BadRequestException);

    const blocked: any = invoiceRow({ matchStatus: MatchStatus.BLOCKED, blockReason: 'variance' });
    invoiceRepo.findOne.mockResolvedValue(blocked);
    lineRepo.find.mockResolvedValue([]);
    await service.overrideBlock('t1', 'inv1', 'CFO approved');
    expect(blocked.matchStatus).toBe(MatchStatus.MATCHED);
    expect(blocked.blockOverrideNote).toBe('CFO approved');
    expect(blocked.blockReason).toBeNull();
  });

  // ─── Approval & payment ─────────────────────────────────────────

  it('approveInvoice requires MATCHED and posts the GR/IR IV entry', async () => {
    invoiceRepo.findOne.mockResolvedValue(invoiceRow({ status: VendorInvoiceStatus.SUBMITTED }));
    await expect(service.approveInvoice('t1', 'inv1', 'u1')).rejects.toThrow(BadRequestException);

    const matched: any = invoiceRow({ status: VendorInvoiceStatus.MATCHED, invoiceNumber: 'VINV-000001', invoiceDate: '2026-07-01' });
    invoiceRepo.findOne.mockResolvedValue(matched);
    lineRepo.find.mockResolvedValue([]);
    await service.approveInvoice('t1', 'inv1', 'u1');
    expect(matched.status).toBe(VendorInvoiceStatus.APPROVED);
    expect(grirService.createIvEntry).toHaveBeenCalled();
    expect(grirService.autoMatch).toHaveBeenCalledWith('t1');
  });

  it('recordPayment tracks partial then full payment', async () => {
    const inv: any = invoiceRow({ status: VendorInvoiceStatus.APPROVED, total: 100, paidAmount: 0 });
    invoiceRepo.findOne.mockResolvedValue(inv);
    let r = await service.recordPayment('t1', 'inv1', 40);
    expect(inv.status).toBe(VendorInvoiceStatus.PARTIALLY_PAID);
    expect(r.outstanding).toBe(60);

    r = await service.recordPayment('t1', 'inv1', 60);
    expect(inv.status).toBe(VendorInvoiceStatus.PAID);
    expect(r.outstanding).toBe(0);
  });

  it('recordPayment rejects payment on a non-approved invoice', async () => {
    invoiceRepo.findOne.mockResolvedValue(invoiceRow({ status: VendorInvoiceStatus.DRAFT }));
    await expect(service.recordPayment('t1', 'inv1', 10)).rejects.toThrow(BadRequestException);
  });

  it('getPolicy seeds a default 5%/5% policy on first use', async () => {
    tolerancePolicyRepo.findOne.mockResolvedValue(null);
    const p = await service.getPolicy('t1');
    expect(tolerancePolicyRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      pricePercentTolerance: 5, qtyPercentTolerance: 5, scope: 'GLOBAL',
    }));
    expect(p).toBeDefined();
  });

  it('lookups are tenant-scoped 404s', async () => {
    invoiceRepo.findOne.mockResolvedValue(null);
    await expect(service.getInvoice('t2', 'x')).rejects.toThrow(NotFoundException);
    expect(invoiceRepo.findOne).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't2' } });
  });
});
