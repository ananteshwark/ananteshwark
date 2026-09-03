import { Iso20022Service } from './iso20022.service';

describe('Iso20022Service — pain.001.001.03 writer', () => {
  const service = new Iso20022Service();

  const base = {
    msgId: 'PAIN001-ABC12345',
    createdAt: new Date('2026-07-01T10:00:00Z'),
    initiatingParty: 'Acme Industries Pvt Ltd',
    executionDate: '2026-07-05',
    currency: 'INR',
    debtor: { name: 'Acme Industries Pvt Ltd', iban: null, accountNumber: '00123456789', bic: 'HDFCINBB' },
  };

  it('produces a valid document skeleton with control totals', () => {
    const xml = service.buildPain001({
      ...base,
      payments: [
        { endToEndId: 'E2E-1', amount: 1000.5, creditorName: 'Vendor A', creditorIban: 'DE89370400440532013000', creditorBic: 'COBADEFF' },
        { endToEndId: 'E2E-2', amount: 249.5, creditorName: 'Vendor B', creditorAccountNumber: '999888777', creditorClearingCode: 'SBIN0001234' },
      ],
    });
    expect(xml).toContain('urn:iso:std:iso:20022:tech:xsd:pain.001.001.03');
    expect(xml).toContain('<NbOfTxs>2</NbOfTxs>');
    expect(xml).toContain('<CtrlSum>1250.00</CtrlSum>');
    expect(xml).toContain('<PmtMtd>TRF</PmtMtd>');
    expect(xml).toContain('<ReqdExctnDt>2026-07-05</ReqdExctnDt>');
    expect(xml).toContain('<InstdAmt Ccy="INR">1000.50</InstdAmt>');
  });

  it('uses IBAN when available, falls back to Othr account id otherwise', () => {
    const xml = service.buildPain001({
      ...base,
      payments: [
        { endToEndId: 'E1', amount: 1, creditorName: 'A', creditorIban: 'DE89370400440532013000' },
        { endToEndId: 'E2', amount: 1, creditorName: 'B', creditorAccountNumber: '12345' },
        { endToEndId: 'E3', amount: 1, creditorName: 'C' }, // no details at all
      ],
    });
    expect(xml).toContain('<IBAN>DE89370400440532013000</IBAN>');
    expect(xml).toContain('<Othr><Id>12345</Id></Othr>');
    expect(xml).toContain('<Othr><Id>NOTPROVIDED</Id></Othr>');
  });

  it('routes via BIC when present, else domestic clearing code (IFSC)', () => {
    const xml = service.buildPain001({
      ...base,
      payments: [
        { endToEndId: 'E1', amount: 1, creditorName: 'A', creditorBic: 'COBADEFF', creditorClearingCode: 'IGNORED' },
        { endToEndId: 'E2', amount: 1, creditorName: 'B', creditorClearingCode: 'SBIN0001234' },
      ],
    });
    expect(xml).toContain('<BIC>COBADEFF</BIC>');
    expect(xml).not.toContain('IGNORED');
    expect(xml).toContain('<ClrSysMmbId><MmbId>SBIN0001234</MmbId></ClrSysMmbId>');
  });

  it('escapes XML-hostile characters and truncates remittance to 140 chars', () => {
    const xml = service.buildPain001({
      ...base,
      payments: [{
        endToEndId: 'E1', amount: 1, creditorName: 'Smith & Sons <Pvt> "Ltd"',
        remittance: 'X'.repeat(200),
      }],
    });
    expect(xml).toContain('Smith &amp; Sons &lt;Pvt&gt; &quot;Ltd&quot;');
    expect(xml).not.toContain('& Sons <Pvt>');
    const remit = xml.match(/<Ustrd>(X+)<\/Ustrd>/);
    expect(remit![1]).toHaveLength(140);
  });
});

describe('PaymentRunService.generatePain001 — vendor aggregation', () => {
  const { PaymentRunService } = require('./payment-run.service');

  const mockRepo = () => ({ findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) });

  it('sums per vendor, carries bank details, and joins bill numbers into remittance', async () => {
    const runRepo = mockRepo();
    runRepo.findOne.mockResolvedValue({ id: 'run-12345678', tenantId: 't1', runDate: '2026-07-01', postingDate: '2026-07-05', bankAccountId: 'acct-1' });
    const itemRepo = mockRepo();
    itemRepo.find.mockResolvedValue([
      { vendorId: 'v1', vendorName: 'Vendor One', amount: 100, billNumber: 'BILL-1', included: true },
      { vendorId: 'v1', vendorName: 'Vendor One', amount: 50, billNumber: 'BILL-2', included: true },
      { vendorId: 'v2', vendorName: 'Vendor Two', amount: 75, billNumber: 'BILL-3', included: true },
    ]);
    const vendorRepo = mockRepo();
    vendorRepo.find.mockResolvedValue([
      { id: 'v1', iban: 'DE89370400440532013000', swift: 'COBADEFF' },
      { id: 'v2', bankAccountNumber: '999888', bankIfsc: 'SBIN0001234' },
    ]);
    const service = new PaymentRunService(
      runRepo, itemRepo, mockRepo(), vendorRepo,
      {} as any, {} as any, {} as any,
      new Iso20022Service(),
    );
    const xml = await service.generatePain001('t1', 'run-12345678', { debtorName: 'Acme', currency: 'EUR' });
    expect(xml).toContain('<NbOfTxs>2</NbOfTxs>'); // 3 items → 2 vendor payments
    expect(xml).toContain('<CtrlSum>225.00</CtrlSum>');
    expect(xml).toContain('<InstdAmt Ccy="EUR">150.00</InstdAmt>');
    expect(xml).toContain('<Ustrd>BILL-1, BILL-2</Ustrd>');
    expect(xml).toContain('<IBAN>DE89370400440532013000</IBAN>');
    expect(xml).toContain('<MmbId>SBIN0001234</MmbId>');
    expect(xml).toContain('<ReqdExctnDt>2026-07-05</ReqdExctnDt>');
  });
});
