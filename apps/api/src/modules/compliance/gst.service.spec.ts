import { BadRequestException } from '@nestjs/common';
import { GstService, fiscalYear } from './gst.service';
import { GstEInvoiceStatus } from './entities/gst-einvoice.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', createdAt: new Date(), ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('GstService — e-invoicing', () => {
  let service: GstService;
  let einvoiceRepo: any, invoiceRepo: any, lineRepo: any, customerRepo: any, billRepo: any;

  const seller = { gstin: '29ABCDE1234F1Z5', legalName: 'Acme Industries Pvt Ltd' };
  const invoice: any = {
    id: 'inv-1', tenantId: 't1', invoiceNumber: 'INV-000042', invoiceDate: '2026-06-15',
    customerId: 'c1', subtotal: 1000, taxAmount: 180, total: 1180, status: 'SENT',
  };
  const lines: any[] = [
    { lineNumber: 1, description: 'Widget', quantity: 10, unitPrice: 100, taxRate: 18, taxAmount: 180, lineTotal: 1180 },
  ];

  beforeEach(() => {
    einvoiceRepo = mockRepo(); invoiceRepo = mockRepo(); lineRepo = mockRepo();
    customerRepo = mockRepo(); billRepo = mockRepo();
    service = new GstService(einvoiceRepo, invoiceRepo, lineRepo, customerRepo, billRepo);
  });

  it('computes the Indian fiscal year correctly around April', () => {
    expect(fiscalYear('2026-03-31')).toBe('2025-26');
    expect(fiscalYear('2026-04-01')).toBe('2026-27');
  });

  it('IRN is deterministic for the same supplier + FY + document', () => {
    const a = service.computeIrn('29ABCDE1234F1Z5', '2026-06-15', 'INV-000042');
    const b = service.computeIrn('29abcde1234f1z5', '2026-06-15', 'INV-000042'); // case-insensitive GSTIN
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(service.computeIrn('29ABCDE1234F1Z5', '2026-06-15', 'INV-000043')).not.toBe(a);
  });

  it('intra-state supply splits tax into CGST + SGST', () => {
    const payload = service.buildIrpPayload(invoice, lines as any,
      { name: 'Local Buyer', gstin: '29ZZZZZ9999Z9Z9' }, seller); // same state 29
    expect(payload.ValDtls).toMatchObject({ CgstVal: 90, SgstVal: 90, IgstVal: 0, TotInvVal: 1180 });
    expect(payload.ItemList[0]).toMatchObject({ CgstAmt: 90, SgstAmt: 90, IgstAmt: 0, AssAmt: 1000 });
    expect(payload.DocDtls.Dt).toBe('15/06/2026');
  });

  it('inter-state supply reports IGST', () => {
    const payload = service.buildIrpPayload(invoice, lines as any,
      { name: 'Remote Buyer', gstin: '07YYYYY8888Y8Y8' }, seller); // Delhi 07 vs Karnataka 29
    expect(payload.ValDtls).toMatchObject({ IgstVal: 180, CgstVal: 0, SgstVal: 0 });
    expect(payload.BuyerDtls.Pos).toBe('07');
  });

  it('rejects buyers and sellers without a valid GSTIN', () => {
    expect(() => service.buildIrpPayload(invoice, lines as any, { name: 'No GSTIN Co', gstin: '' }, seller))
      .toThrow('no valid GSTIN');
    expect(() => service.buildIrpPayload(invoice, lines as any, { name: 'B', gstin: '29ZZZZZ9999Z9Z9' }, { ...seller, gstin: 'short' }))
      .toThrow('seller GSTIN');
  });

  it('generateEInvoice persists payload + IRN and is idempotent per invoice', async () => {
    invoiceRepo.findOne.mockResolvedValue(invoice);
    lineRepo.find.mockResolvedValue(lines);
    customerRepo.findOne.mockResolvedValue({ id: 'c1', name: 'Buyer', taxId: '29ZZZZZ9999Z9Z9' });
    const first = await service.generateEInvoice('t1', 'inv-1', seller);
    expect(first.irn).toHaveLength(64);
    expect(first.payload.DocDtls.No).toBe('INV-000042');

    einvoiceRepo.findOne.mockResolvedValue({ ...first, status: GstEInvoiceStatus.GENERATED });
    const again = await service.generateEInvoice('t1', 'inv-1', seller);
    expect(again.irn).toBe(first.irn);
    expect(invoiceRepo.findOne).toHaveBeenCalledTimes(1); // second call short-circuits
  });

  it('transmit sends through the IRP transport and stamps the ack; idempotent', async () => {
    const irp = { transmit: jest.fn().mockResolvedValue({ ackNo: '112233445566778', ackDate: '2026-06-15 10:00:00', status: 'ACT' }) };
    service = new GstService(einvoiceRepo, invoiceRepo, lineRepo, customerRepo, billRepo, irp as any);
    einvoiceRepo.findOne.mockResolvedValue({
      id: 'e1', tenantId: 't1', irn: 'IRN1', payload: { DocDtls: {} }, status: GstEInvoiceStatus.GENERATED,
    });
    const sent = await service.transmitEInvoice('t1', 'e1');
    expect(irp.transmit).toHaveBeenCalledWith(expect.objectContaining({ irn: 'IRN1' }));
    expect(sent.status).toBe(GstEInvoiceStatus.TRANSMITTED);
    expect(sent.ackNo).toBe('112233445566778');

    einvoiceRepo.findOne.mockResolvedValue({ ...sent, status: GstEInvoiceStatus.TRANSMITTED });
    await service.transmitEInvoice('t1', 'e1');
    expect(irp.transmit).toHaveBeenCalledTimes(1); // already transmitted → short-circuit

    einvoiceRepo.findOne.mockResolvedValue({ id: 'e1', tenantId: 't1', status: GstEInvoiceStatus.CANCELLED });
    await expect(service.transmitEInvoice('t1', 'e1')).rejects.toThrow('Cancelled');
  });

  it('transmit fails loudly when no IRP transport is bound', async () => {
    einvoiceRepo.findOne.mockResolvedValue({ id: 'e1', tenantId: 't1', status: GstEInvoiceStatus.GENERATED });
    await expect(service.transmitEInvoice('t1', 'e1')).rejects.toThrow('No IRP transport');
  });

  it('cancellation is only allowed within 24 hours and needs a reason', async () => {
    const fresh = { id: 'e1', tenantId: 't1', status: GstEInvoiceStatus.GENERATED, createdAt: new Date() };
    einvoiceRepo.findOne.mockResolvedValue({ ...fresh });
    await expect(service.cancelEInvoice('t1', 'e1', ' ')).rejects.toThrow('reason is required');
    const cancelled = await service.cancelEInvoice('t1', 'e1', 'Wrong buyer');
    expect(cancelled.status).toBe(GstEInvoiceStatus.CANCELLED);

    einvoiceRepo.findOne.mockResolvedValue({
      ...fresh, createdAt: new Date(Date.now() - 25 * 3600_000),
    });
    await expect(service.cancelEInvoice('t1', 'e1', 'Too late')).rejects.toThrow('within 24 hours');
  });
});

describe('GstService — return summaries', () => {
  let service: GstService;
  let invoiceRepo: any, customerRepo: any, billRepo: any;

  beforeEach(() => {
    invoiceRepo = mockRepo(); customerRepo = mockRepo(); billRepo = mockRepo();
    service = new GstService(mockRepo() as any, invoiceRepo, mockRepo() as any, customerRepo, billRepo);
  });

  it('GSTR-1 groups B2B by customer GSTIN and buckets B2C, skipping drafts', async () => {
    invoiceRepo.find.mockResolvedValue([
      { customerId: 'c1', subtotal: 1000, taxAmount: 180, total: 1180, status: 'SENT' },
      { customerId: 'c1', subtotal: 500, taxAmount: 90, total: 590, status: 'PAID' },
      { customerId: 'c2', subtotal: 200, taxAmount: 36, total: 236, status: 'SENT' },   // no GSTIN → B2C
      { customerId: 'c1', subtotal: 999, taxAmount: 99, total: 1098, status: 'DRAFT' }, // excluded
    ]);
    customerRepo.find.mockResolvedValue([
      { id: 'c1', name: 'Reg Buyer', taxId: '29ZZZZZ9999Z9Z9' },
      { id: 'c2', name: 'Walk-in', taxId: null },
    ]);
    const r = await service.gstr1Summary('t1', '2026-06-01', '2026-06-30');
    expect(r.b2b).toHaveLength(1);
    expect(r.b2b[0]).toMatchObject({ gstin: '29ZZZZZ9999Z9Z9', invoiceCount: 2, taxableValue: 1500, taxAmount: 270 });
    expect(r.b2c).toMatchObject({ invoiceCount: 1, taxableValue: 200 });
    expect(r.totals).toMatchObject({ invoiceCount: 3, taxableValue: 1700, taxAmount: 306 });
  });

  it('GSTR-3B nets output tax against input tax credit', async () => {
    invoiceRepo.find.mockResolvedValue([
      { subtotal: 10000, taxAmount: 1800, status: 'SENT' },
    ]);
    billRepo.find.mockResolvedValue([
      { subtotal: 4000, taxAmount: 720, status: 'POSTED' },
      { subtotal: 1000, taxAmount: 180, status: 'DRAFT' }, // excluded
    ]);
    const r = await service.gstr3bSummary('t1', '2026-06-01', '2026-06-30');
    expect(r.outwardSupplies).toEqual({ taxableValue: 10000, taxAmount: 1800 });
    expect(r.inwardSupplies).toEqual({ taxableValue: 4000, inputTaxCredit: 720 });
    expect(r.netTaxPayable).toBe(1080);
    expect(r.itcCarryForward).toBe(0);
  });
});
