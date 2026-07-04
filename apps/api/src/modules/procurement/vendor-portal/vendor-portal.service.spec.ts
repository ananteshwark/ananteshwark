import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { VendorPortalService } from './vendor-portal.service';

/**
 * Vendor portal security: bcrypt login gated on portalEnabled, every read
 * scoped to the calling vendor (invited RFQs, own POs/invoices only), PO
 * ownership verified before invoice submission, quote resubmission replaces
 * prior quotes and marks the vendor responded.
 */
describe('VendorPortalService', () => {
  let service: VendorPortalService;
  let vendorRepo: any, rfqRepo: any, rfqVendorRepo: any, rfqQuoteRepo: any, poRepo: any, vendorInvoiceService: any;
  let passwordHash: string;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(),
  });

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('vendor-pass', 4);
  });

  beforeEach(() => {
    vendorRepo = mockRepo(); rfqRepo = mockRepo(); rfqVendorRepo = mockRepo();
    rfqQuoteRepo = mockRepo(); poRepo = mockRepo();
    vendorInvoiceService = {
      createInvoice: jest.fn().mockResolvedValue({ id: 'inv-1' }),
      listInvoices: jest.fn().mockResolvedValue({ items: [] }),
      getInvoice: jest.fn(),
    };
    service = new VendorPortalService(
      vendorRepo, rfqRepo, rfqVendorRepo, rfqQuoteRepo, poRepo, vendorInvoiceService,
    );
  });

  it('vendorLogin succeeds with valid credentials and stamps last login', async () => {
    const vendor: any = { id: 'v1', name: 'Acme Supplies', portalPasswordHash: passwordHash, portalEnabled: true };
    vendorRepo.findOne.mockResolvedValue(vendor);
    const r = await service.vendorLogin('t1', 'VENDOR@x.com', 'vendor-pass');
    expect(r).toEqual({ vendorId: 'v1', vendorName: 'Acme Supplies', tenantId: 't1' });
    expect(vendor.portalLastLogin).toBeInstanceOf(Date);
    // lookup lowercases the email and requires portalEnabled
    expect(vendorRepo.findOne).toHaveBeenCalledWith({
      where: { portalEmail: 'vendor@x.com', tenantId: 't1', portalEnabled: true },
    });
  });

  it('vendorLogin rejects a wrong password and a portal-disabled vendor identically', async () => {
    vendorRepo.findOne.mockResolvedValue({ id: 'v1', portalPasswordHash: passwordHash });
    await expect(service.vendorLogin('t1', 'v@x.com', 'wrong')).rejects.toThrow(UnauthorizedException);

    vendorRepo.findOne.mockResolvedValue(null); // disabled/unknown filtered by the where clause
    await expect(service.vendorLogin('t1', 'v@x.com', 'vendor-pass')).rejects.toThrow(UnauthorizedException);
  });

  it('enablePortalAccess stores only a bcrypt hash, never the raw password', async () => {
    const vendor: any = { id: 'v1', tenantId: 't1' };
    vendorRepo.findOne.mockResolvedValue(vendor);
    await service.enablePortalAccess('t1', 'v1', 'v@x.com', 'secret-pass');
    expect(vendor.portalEnabled).toBe(true);
    expect(vendor.portalPasswordHash).not.toBe('secret-pass');
    expect(await bcrypt.compare('secret-pass', vendor.portalPasswordHash)).toBe(true);
  });

  it('getRfqDetail refuses RFQs the vendor was not invited to', async () => {
    rfqVendorRepo.findOne.mockResolvedValue(null);
    await expect(service.getRfqDetail('t1', 'rfq1', 'v1')).rejects.toThrow(NotFoundException);
  });

  it('submitQuote replaces prior quotes per line and marks the vendor responded', async () => {
    const rfqVendor: any = { rfqId: 'rfq1', vendorId: 'v1', responded: false };
    rfqVendorRepo.findOne.mockResolvedValue(rfqVendor);
    await service.submitQuote('t1', 'rfq1', 'v1', {
      lines: [{ lineId: 'l1', unitPrice: 10 }, { lineId: 'l2', unitPrice: 20 }],
    } as any);
    expect(rfqQuoteRepo.delete).toHaveBeenCalledWith({ rfqId: 'rfq1', vendorId: 'v1', tenantId: 't1', lineId: 'l1' });
    expect(rfqQuoteRepo.delete).toHaveBeenCalledWith({ rfqId: 'rfq1', vendorId: 'v1', tenantId: 't1', lineId: 'l2' });
    expect(rfqVendor.responded).toBe(true);
    expect(rfqVendor.respondedAt).toBeInstanceOf(Date);
  });

  it("submitInvoice rejects a PO that isn't the vendor's", async () => {
    poRepo.findOne.mockResolvedValue(null); // scoped lookup finds nothing
    await expect(
      service.submitInvoice('t1', 'v1', { poId: 'someone-elses-po', invoiceDate: '2026-07-01', lines: [] } as any),
    ).rejects.toThrow(BadRequestException);
    expect(poRepo.findOne).toHaveBeenCalledWith({ where: { id: 'someone-elses-po', tenantId: 't1', vendorId: 'v1' } });
  });

  it('submitInvoice tags the invoice with VENDOR_PORTAL source and the vendor identity', async () => {
    poRepo.findOne.mockResolvedValue({ id: 'po1' });
    vendorRepo.findOne.mockResolvedValue({ id: 'v1', name: 'Acme Supplies' });
    await service.submitInvoice('t1', 'v1', {
      poId: 'po1', invoiceDate: '2026-07-01',
      lines: [{ description: 'X', quantity: 1, unitPrice: 10 }],
    } as any);
    const [, dto, source] = vendorInvoiceService.createInvoice.mock.calls[0];
    expect(dto.vendorId).toBe('v1');
    expect(dto.vendorName).toBe('Acme Supplies');
    expect(source).toBe('VENDOR_PORTAL');
  });

  it("vendorInvoiceDetail hides another vendor's invoice as 404", async () => {
    vendorInvoiceService.getInvoice.mockResolvedValue({ id: 'inv1', vendorId: 'other-vendor' });
    await expect(service.vendorInvoiceDetail('t1', 'inv1', 'v1')).rejects.toThrow(NotFoundException);
  });

  it('getMyPayments summarizes paid and outstanding amounts', async () => {
    vendorInvoiceService.listInvoices.mockResolvedValue({
      items: [
        { status: 'PAID', total: 100, paidAmount: 100 },
        { status: 'PARTIALLY_PAID', total: 200, paidAmount: 50 },
        { status: 'DRAFT', total: 999, paidAmount: 0 }, // excluded
      ],
    });
    const r = await service.getMyPayments('t1', 'v1');
    expect(r.summary).toEqual({ totalPaid: 150, totalOutstanding: 150, invoiceCount: 2 });
  });
});
