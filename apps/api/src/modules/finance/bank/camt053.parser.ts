/**
 * Minimal ISO 20022 camt.053 (bank-to-customer statement) parser.
 *
 * Dependency-free by design: banks emit well-formed camt XML, so entry
 * blocks can be extracted with tolerant tag matching instead of a DOM
 * library. Produces the same row shape the CSV import pipeline consumes,
 * so dedupe and auto-matching apply identically to both formats.
 */

export interface Camt053Entry {
  date: string;          // yyyy-mm-dd booking date
  amount: number;        // signed: credit +, debit −
  reference: string | null;
  description: string | null;
}

export interface Camt053Statement {
  statementId: string | null;
  accountIban: string | null;
  currency: string | null;
  entries: Camt053Entry[];
}

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].trim() : null;
};

const tagAttr = (xml: string, name: string, attr: string): string | null => {
  const m = xml.match(new RegExp(`<${name}[^>]*\\b${attr}="([^"]*)"[^>]*>`, 'i'));
  return m ? m[1] : null;
};

const unescape = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function parseCamt053(xml: string): Camt053Statement {
  if (!xml || !/camt\.053|BkToCstmrStmt/i.test(xml)) {
    throw new Error('Not a camt.053 bank-to-customer statement');
  }

  const stmtBlock = tag(xml, 'Stmt') ?? xml;
  const statementId = tag(stmtBlock, 'Id');
  const acctBlock = tag(stmtBlock, 'Acct');
  const accountIban = acctBlock ? tag(acctBlock, 'IBAN') ?? tag(tag(acctBlock, 'Othr') ?? '', 'Id') : null;
  const currency = acctBlock ? tag(acctBlock, 'Ccy') : null;

  const entries: Camt053Entry[] = [];
  const entryPattern = /<Ntry[^>]*>([\s\S]*?)<\/Ntry>/gi;
  let match: RegExpExecArray | null;
  while ((match = entryPattern.exec(stmtBlock))) {
    const block = match[1];
    const rawAmount = tag(block, 'Amt');
    if (rawAmount === null || Number.isNaN(Number(rawAmount))) continue;
    const indicator = (tag(block, 'CdtDbtInd') ?? 'CRDT').toUpperCase();
    const sign = indicator === 'DBIT' ? -1 : 1;

    // Booking date: <BookgDt><Dt>…</Dt></BookgDt> or a DtTm variant.
    const bookingBlock = tag(block, 'BookgDt') ?? tag(block, 'ValDt') ?? '';
    const date = (tag(bookingBlock, 'Dt') ?? tag(bookingBlock, 'DtTm') ?? '').slice(0, 10);
    if (!date) continue;

    const reference =
      tag(block, 'EndToEndId') ?? tag(block, 'AcctSvcrRef') ?? tag(block, 'NtryRef');
    const description =
      tag(block, 'Ustrd') ?? tag(block, 'AddtlNtryInf') ?? tag(block, 'AddtlTxInf');

    entries.push({
      date,
      amount: sign * Number(rawAmount),
      reference: reference ? unescape(reference) : null,
      description: description ? unescape(description) : null,
    });
  }

  return { statementId, accountIban, currency, entries };
}
