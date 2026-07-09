import { PeppolService } from './peppol.service';
import { buildUblInvoice } from './ubl-invoice.builder';
import { SandboxIrpTransport } from './irp.transport';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('buildUblInvoice — PEPPOL BIS 3.0 writer', () => {
  const input = {
    invoiceNumber: 'INV-000042',
    issueDate: '2026-06-15',
    dueDate: '2026-07-15',
    currency: 'EUR',
    buyerReference: 'PO-889',
    supplier: { name: 'Acme GmbH & Co', vatId: 'DE811111111', countryCode: 'DE', city: 'Berlin' },
    customer: { name: 'Køber A/S', vatId: 'DK22222222', countryCode: 'DK' },
    lines: [
      { description: 'Widget <standard>', quantity: 10, unitPrice: 100, taxRate: 19, taxAmount: 190, taxable: 1000 },
      { description: 'Gadget', quantity: 2, unitPrice: 250, taxRate: 19, taxAmount: 95, taxable: 500 },
      { description: 'Export item', quantity: 1, unitPrice: 300, taxRate: 0, taxAmount: 0 },
    ],
    taxExclusiveAmount: 1800,
    taxAmount: 285,
    payableAmount: 2085,
  };

  it('emits the BIS 3.0 customization/profile ids and header fields', () => {
    const xml = buildUblInvoice(input as any);
    expect(xml).toContain('urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0');
    expect(xml).toContain('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0');
    expect(xml).toContain('<cbc:ID>INV-000042</cbc:ID>');
    expect(xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:BuyerReference>PO-889</cbc:BuyerReference>');
  });

  it('groups tax subtotals per rate: one 19% bucket, one zero-rated bucket', () => {
    const xml = buildUblInvoice(input as any);
    const subtotals = xml.match(/<cac:TaxSubtotal>/g) ?? [];
    expect(subtotals).toHaveLength(2);
    expect(xml).toContain('<cbc:TaxableAmount currencyID="EUR">1500.00</cbc:TaxableAmount>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="EUR">285.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:ID>Z</cbc:ID>'); // zero-rated category
  });

  it('reconciles monetary totals and escapes markup in names', () => {
    const xml = buildUblInvoice(input as any);
    expect(xml).toContain('<cbc:LineExtensionAmount currencyID="EUR">1800.00</cbc:LineExtensionAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">2085.00</cbc:PayableAmount>');
    expect(xml).toContain('Acme GmbH &amp; Co');
    expect(xml).toContain('Widget &lt;standard&gt;');
    expect(xml).not.toContain('Widget <standard>');
  });

  it('supplier and customer parties carry VAT scheme and country', () => {
    const xml = buildUblInvoice(input as any);
    expect(xml).toContain('<cbc:CompanyID>DE811111111</cbc:CompanyID>');
    expect(xml).toContain('<cbc:IdentificationCode>DK</cbc:IdentificationCode>');
    expect((xml.match(/<cac:PartyTaxScheme>/g) ?? [])).toHaveLength(2);
  });
});

describe('PeppolService — invoice export', () => {
  let service: PeppolService;
  let invoiceRepo: any, lineRepo: any, customerRepo: any;

  const supplier = { name: 'Acme GmbH', vatId: 'DE811111111', countryCode: 'de' };
  const invoice: any = {
    id: 'inv-1', tenantId: 't1', invoiceNumber: 'INV-000042', invoiceDate: '2026-06-15',
    dueDate: '2026-07-15', currency: 'EUR', customerId: 'c1', reference: 'PO-889',
    subtotal: 1000, taxAmount: 190, total: 1190, status: 'SENT',
  };

  beforeEach(() => {
    invoiceRepo = mockRepo(); lineRepo = mockRepo(); customerRepo = mockRepo();
    service = new PeppolService(invoiceRepo, lineRepo, customerRepo);
  });

  it('renders a full UBL document from the AR invoice + customer master', async () => {
    invoiceRepo.findOne.mockResolvedValue(invoice);
    lineRepo.find.mockResolvedValue([
      { lineNumber: 1, description: 'Widget', quantity: 10, unitPrice: 100, taxRate: 19, taxAmount: 190, lineTotal: 1190 },
    ]);
    customerRepo.findOne.mockResolvedValue({
      id: 'c1', name: 'Køber A/S', taxId: 'DK22222222',
      billingAddress: { line1: 'Havnegade 1', city: 'København', postalCode: '1058', country: 'DK' },
    });
    const xml = await service.buildUblForInvoice('t1', 'inv-1', supplier);
    expect(xml).toContain('<cbc:ID>INV-000042</cbc:ID>');
    expect(xml).toContain('<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>');
    expect(xml).toContain('<cbc:IdentificationCode>DE</cbc:IdentificationCode>'); // supplier country uppercased
    expect(xml).toContain('<cbc:IdentificationCode>DK</cbc:IdentificationCode>'); // from billing address
    expect(xml).toContain('<cbc:StreetName>Havnegade 1</cbc:StreetName>');
  });

  it('refuses drafts, missing lines, and bad supplier details', async () => {
    await expect(service.buildUblForInvoice('t1', 'inv-1', { ...supplier, countryCode: 'Germany' }))
      .rejects.toThrow('alpha-2');
    invoiceRepo.findOne.mockResolvedValue({ ...invoice, status: 'DRAFT' });
    await expect(service.buildUblForInvoice('t1', 'inv-1', supplier)).rejects.toThrow('DRAFT');
    invoiceRepo.findOne.mockResolvedValue(invoice);
    lineRepo.find.mockResolvedValue([]);
    await expect(service.buildUblForInvoice('t1', 'inv-1', supplier)).rejects.toThrow('no lines');
  });
});

describe('SandboxIrpTransport', () => {
  it('acks deterministically per IRN with a 15-digit ack number', async () => {
    const transport = new SandboxIrpTransport();
    const a = await transport.transmit({ irn: 'abc123', payload: {} });
    const b = await transport.transmit({ irn: 'abc123', payload: {} });
    expect(a.ackNo).toBe(b.ackNo);
    expect(a.ackNo).toMatch(/^\d{15}$/);
    expect(a.status).toBe('ACT');
    const other = await transport.transmit({ irn: 'different', payload: {} });
    expect(other.ackNo).not.toBe(a.ackNo);
  });
});
