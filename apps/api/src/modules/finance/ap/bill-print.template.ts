interface PrintLine {
  description?: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

interface BillPrintData {
  bill: {
    billNumber: string;
    billDate: string;
    dueDate: string;
    status: string;
    subtotal: number;
    taxAmount: number;
    total: number;
    amountPaid: number;
    balanceDue: number;
    currency: string;
    reference?: string;
    notes?: string;
  };
  vendor: {
    name: string;
    code?: string;
    email?: string;
    phone?: string;
    taxId?: string;
  } | null;
  lines: PrintLine[];
  companyName: string;
}

const esc = (v: any): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (n: number, currency: string): string =>
  `${esc(currency)} ${Number(n ?? 0).toFixed(2)}`;

export function renderBillPrint(data: BillPrintData): string {
  const { bill, vendor, lines, companyName } = data;
  const rows = lines
    .map(
      (l, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${esc(l.description) || '&mdash;'}</td>
        <td class="num">${Number(l.quantity ?? 0).toFixed(2)}</td>
        <td class="num">${Number(l.unitPrice ?? 0).toFixed(2)}</td>
        <td class="num">${Number(l.taxRate ?? 0).toFixed(2)}%</td>
        <td class="num">${Number(l.lineTotal ?? 0).toFixed(2)}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Bill ${esc(bill.billNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; padding: 32px; background: #f3f4f6; }
  .doc { max-width: 800px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; }
  .company { font-size: 22px; font-weight: 700; color: #111827; }
  .doc-title { text-align: right; }
  .doc-title h1 { margin: 0; font-size: 26px; color: #4f46e5; letter-spacing: 1px; }
  .doc-title .meta { font-size: 13px; color: #6b7280; margin-top: 4px; }
  .parties { display: flex; justify-content: space-between; margin-bottom: 24px; gap: 24px; }
  .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #9ca3af; margin: 0 0 6px; }
  .party p { margin: 2px 0; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead th { background: #f9fafb; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; padding: 10px; border-bottom: 1px solid #e5e7eb; }
  tbody td { padding: 10px; font-size: 14px; border-bottom: 1px solid #f3f4f6; }
  .num { text-align: right; }
  td.num, th.num { text-align: right; }
  .totals { width: 280px; margin-left: auto; }
  .totals tr td { padding: 6px 10px; border: none; }
  .totals .label { color: #6b7280; }
  .totals .grand td { font-weight: 700; font-size: 16px; border-top: 2px solid #111827; padding-top: 10px; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #eef2ff; color: #4f46e5; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #4f46e5; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; font-size: 14px; cursor: pointer; }
  @media print { body { background: #fff; padding: 0; } .doc { box-shadow: none; max-width: none; } .print-btn { display: none; } }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
  <div class="doc">
    <div class="header">
      <div class="company">${esc(companyName)}</div>
      <div class="doc-title">
        <h1>BILL</h1>
        <div class="meta">No. ${esc(bill.billNumber)}</div>
        <div class="meta">Date: ${esc(bill.billDate)}</div>
        <div class="meta">Due: ${esc(bill.dueDate)}</div>
        <div class="meta"><span class="status">${esc(bill.status)}</span></div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <h3>Vendor</h3>
        <p><strong>${esc(vendor?.name) || 'Unknown vendor'}</strong></p>
        ${vendor?.code ? `<p>Code: ${esc(vendor.code)}</p>` : ''}
        ${vendor?.email ? `<p>${esc(vendor.email)}</p>` : ''}
        ${vendor?.phone ? `<p>${esc(vendor.phone)}</p>` : ''}
        ${vendor?.taxId ? `<p>Tax ID: ${esc(vendor.taxId)}</p>` : ''}
      </div>
      <div class="party" style="text-align:right;">
        <h3>Reference</h3>
        <p>${esc(bill.reference) || '&mdash;'}</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit Price</th>
          <th class="num">Tax</th>
          <th class="num">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6" style="text-align:center;color:#9ca3af;">No line items</td></tr>'}
      </tbody>
    </table>

    <table class="totals">
      <tr><td class="label">Subtotal</td><td class="num">${money(bill.subtotal, bill.currency)}</td></tr>
      <tr><td class="label">Tax</td><td class="num">${money(bill.taxAmount, bill.currency)}</td></tr>
      <tr class="grand"><td>Total</td><td class="num">${money(bill.total, bill.currency)}</td></tr>
      <tr><td class="label">Amount Paid</td><td class="num">${money(bill.amountPaid, bill.currency)}</td></tr>
      <tr><td class="label">Balance Due</td><td class="num">${money(bill.balanceDue, bill.currency)}</td></tr>
    </table>

    ${bill.notes ? `<div style="font-size:13px;color:#6b7280;"><strong>Notes:</strong> ${esc(bill.notes)}</div>` : ''}

    <div class="footer">Generated by ${esc(companyName)} &mdash; This is a system-generated document.</div>
  </div>
</body>
</html>`;
}
