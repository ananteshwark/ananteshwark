import { Injectable } from '@nestjs/common';

export interface Pain001Payment {
  endToEndId: string;
  amount: number;
  creditorName: string;
  creditorIban?: string | null;
  creditorAccountNumber?: string | null;
  creditorBic?: string | null;
  /** Domestic clearing code (e.g. IFSC) used when no BIC is available. */
  creditorClearingCode?: string | null;
  remittance?: string;
}

export interface Pain001Input {
  msgId: string;
  createdAt: Date;
  initiatingParty: string;
  executionDate: string; // yyyy-mm-dd
  currency: string;
  debtor: {
    name: string;
    iban?: string | null;
    accountNumber?: string | null;
    bic?: string | null;
  };
  payments: Pain001Payment[];
}

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (n: number) => (Math.round(Number(n) * 100) / 100).toFixed(2);

/**
 * ISO 20022 pain.001.001.03 (customer credit transfer initiation) writer.
 * Pure string assembly — no XML library — so the output is deterministic and
 * dependency-free. One PmtInf block per file; one CdtTrfTxInf per payment.
 */
@Injectable()
export class Iso20022Service {
  buildPain001(input: Pain001Input): string {
    const total = money(input.payments.reduce((sum, p) => sum + Number(p.amount), 0));
    const count = input.payments.length;

    const acct = (iban?: string | null, other?: string | null) =>
      iban
        ? `<Id><IBAN>${esc(iban)}</IBAN></Id>`
        : `<Id><Othr><Id>${esc(other || 'NOTPROVIDED')}</Id></Othr></Id>`;

    const agent = (bic?: string | null, clearing?: string | null) => {
      if (bic) return `<FinInstnId><BIC>${esc(bic)}</BIC></FinInstnId>`;
      if (clearing) {
        return `<FinInstnId><ClrSysMmbId><MmbId>${esc(clearing)}</MmbId></ClrSysMmbId></FinInstnId>`;
      }
      return `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;
    };

    const txs = input.payments
      .map(
        (p) => `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${esc(p.endToEndId)}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="${esc(input.currency)}">${money(p.amount)}</InstdAmt></Amt>
        <CdtrAgt>${agent(p.creditorBic, p.creditorClearingCode)}</CdtrAgt>
        <Cdtr><Nm>${esc(p.creditorName)}</Nm></Cdtr>
        <CdtrAcct>${acct(p.creditorIban, p.creditorAccountNumber)}</CdtrAcct>${
          p.remittance ? `\n        <RmtInf><Ustrd>${esc(p.remittance.slice(0, 140))}</Ustrd></RmtInf>` : ''
        }
      </CdtTrfTxInf>`,
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(input.msgId)}</MsgId>
      <CreDtTm>${input.createdAt.toISOString().slice(0, 19)}</CreDtTm>
      <NbOfTxs>${count}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <InitgPty><Nm>${esc(input.initiatingParty)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(input.msgId)}-01</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${count}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <ReqdExctnDt>${esc(input.executionDate)}</ReqdExctnDt>
      <Dbtr><Nm>${esc(input.debtor.name)}</Nm></Dbtr>
      <DbtrAcct>${acct(input.debtor.iban, input.debtor.accountNumber)}</DbtrAcct>
      <DbtrAgt>${agent(input.debtor.bic)}</DbtrAgt>
${txs}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
  }
}
