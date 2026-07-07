import { parseCamt053 } from './camt053.parser';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Id>STMT-2026-06-001</Id>
      <Acct><Id><IBAN>DE89370400440532013000</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Ntry>
        <Amt Ccy="EUR">1500.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-06-10</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>INV-000042</EndToEndId></Refs>
          <RmtInf><Ustrd>Payment for invoice INV-000042</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">249.90</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><DtTm>2026-06-11T09:30:00</DtTm></BookgDt>
        <AcctSvcrRef>BANKREF-778</AcctSvcrRef>
        <AddtlNtryInf>Card settlement &amp; fees</AddtlNtryInf>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

describe('parseCamt053', () => {
  it('extracts statement metadata and entries with signed amounts', () => {
    const stmt = parseCamt053(SAMPLE);
    expect(stmt.statementId).toBe('STMT-2026-06-001');
    expect(stmt.accountIban).toBe('DE89370400440532013000');
    expect(stmt.currency).toBe('EUR');
    expect(stmt.entries).toHaveLength(2);

    expect(stmt.entries[0]).toEqual({
      date: '2026-06-10',
      amount: 1500,                 // credit → positive
      reference: 'INV-000042',
      description: 'Payment for invoice INV-000042',
    });
    expect(stmt.entries[1]).toEqual({
      date: '2026-06-11',           // DtTm truncated to date
      amount: -249.9,               // debit → negative
      reference: 'BANKREF-778',     // AcctSvcrRef fallback
      description: 'Card settlement & fees', // entities unescaped
    });
  });

  it('skips entries without a parsable amount or booking date', () => {
    const broken = SAMPLE.replace('<Dt>2026-06-10</Dt>', '');
    const stmt = parseCamt053(broken);
    expect(stmt.entries).toHaveLength(1); // first entry dropped, second survives
  });

  it('rejects XML that is not a camt.053 statement', () => {
    expect(() => parseCamt053('<Document><pain.001/></Document>')).toThrow('camt.053');
    expect(() => parseCamt053('')).toThrow();
  });
});
