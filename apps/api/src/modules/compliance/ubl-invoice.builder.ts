export interface UblParty {
  name: string;
  /** VAT / tax registration id (BT-31 / BT-48). */
  vatId?: string | null;
  /** ISO 3166-1 alpha-2 country code — mandatory in PEPPOL BIS 3.0. */
  countryCode: string;
  street?: string | null;
  city?: string | null;
  postalZone?: string | null;
}

export interface UblInvoiceLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
}

export interface UblInvoiceInput {
  invoiceNumber: string;
  issueDate: string; // yyyy-mm-dd
  dueDate?: string | null;
  currency: string;
  buyerReference?: string | null;
  supplier: UblParty;
  customer: UblParty;
  lines: UblInvoiceLineInput[];
  /** Header totals — echoed, not recomputed, so the XML matches the ledger. */
  taxExclusiveAmount: number;
  taxAmount: number;
  payableAmount: number;
}

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (n: number) => (Math.round(Number(n) * 100) / 100).toFixed(2);

/** EN 16931 tax category: standard-rated (S) vs zero-rated (Z). */
const taxCategory = (rate: number) => (Number(rate) > 0 ? 'S' : 'Z');

const party = (p: UblParty) => `    <cac:Party>
      <cac:PostalAddress>${p.street ? `\n        <cbc:StreetName>${esc(p.street)}</cbc:StreetName>` : ''}${p.city ? `\n        <cbc:CityName>${esc(p.city)}</cbc:CityName>` : ''}${p.postalZone ? `\n        <cbc:PostalZone>${esc(p.postalZone)}</cbc:PostalZone>` : ''}
        <cac:Country><cbc:IdentificationCode>${esc(p.countryCode)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>${
        p.vatId
          ? `\n      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(p.vatId)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>`
          : ''
      }
      <cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>`;

/**
 * PEPPOL BIS Billing 3.0 (UBL 2.1 Invoice) writer. Pure string assembly like
 * the pain.001 builder — deterministic, dependency-free. Tax subtotals are
 * grouped per rate from the lines as EN 16931 requires; header totals come
 * from the invoice so the document always reconciles with the ledger.
 */
export function buildUblInvoice(input: UblInvoiceInput): string {
  const ccy = esc(input.currency);
  const lineNet = (l: UblInvoiceLineInput) => Number(l.quantity) * Number(l.unitPrice);
  const lineExtensionTotal = input.lines.reduce((s, l) => s + lineNet(l), 0);

  // BG-23: one tax subtotal per (category, rate).
  const byRate = new Map<string, { rate: number; taxable: number; tax: number }>();
  for (const l of input.lines) {
    const key = `${taxCategory(l.taxRate)}:${Number(l.taxRate)}`;
    const row = byRate.get(key) ?? { rate: Number(l.taxRate), taxable: 0, tax: 0 };
    row.taxable += lineNet(l);
    row.tax += Number(l.taxAmount);
    byRate.set(key, row);
  }

  const taxSubtotals = Array.from(byRate.values())
    .sort((a, b) => b.rate - a.rate)
    .map(
      (r) => `    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${ccy}">${money(r.taxable)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${ccy}">${money(r.tax)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${taxCategory(r.rate)}</cbc:ID>
        <cbc:Percent>${Number(r.rate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`,
    )
    .join('\n');

  const lines = input.lines
    .map(
      (l, i) => `  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${Number(l.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${ccy}">${money(lineNet(l))}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(l.description || `Line ${i + 1}`)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${taxCategory(l.taxRate)}</cbc:ID>
        <cbc:Percent>${Number(l.taxRate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="${ccy}">${money(l.unitPrice)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(input.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${esc(input.issueDate)}</cbc:IssueDate>${input.dueDate ? `\n  <cbc:DueDate>${esc(input.dueDate)}</cbc:DueDate>` : ''}
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${ccy}</cbc:DocumentCurrencyCode>${input.buyerReference ? `\n  <cbc:BuyerReference>${esc(input.buyerReference)}</cbc:BuyerReference>` : ''}
  <cac:AccountingSupplierParty>
${party(input.supplier)}
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
${party(input.customer)}
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${ccy}">${money(input.taxAmount)}</cbc:TaxAmount>
${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${ccy}">${money(lineExtensionTotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${ccy}">${money(input.taxExclusiveAmount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${ccy}">${money(input.payableAmount)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${ccy}">${money(input.payableAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines}
</Invoice>
`;
}
