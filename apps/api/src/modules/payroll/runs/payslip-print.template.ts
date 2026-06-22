interface LineItem {
  code: string;
  name: string;
  amount: number;
}

interface PayslipPrintData {
  payslip: {
    employeeName: string;
    employeeCode: string;
    payPeriodMonth: number;
    payPeriodYear: number;
    daysWorked: number;
    lopDays: number;
    grossEarnings: number;
    totalDeductions: number;
    netPay: number;
    employerContributions: number;
    status: string;
    earnings: LineItem[];
    deductions: LineItem[];
    employerContribs: LineItem[];
    currency?: string;
  };
  companyName: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const esc = (v: any): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function renderPayslipPrint(data: PayslipPrintData): string {
  const { payslip: ps, companyName } = data;
  const currency = ps.currency || 'INR';
  const money = (n: number) => `${esc(currency)} ${Number(n ?? 0).toFixed(2)}`;
  const period = `${MONTHS[ps.payPeriodMonth - 1] ?? ''} ${ps.payPeriodYear}`;

  const lineRows = (items: LineItem[]) =>
    (items && items.length
      ? items
          .map(
            (it) =>
              `<tr><td>${esc(it.name)}</td><td class="num">${Number(it.amount ?? 0).toFixed(2)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="2" style="color:#9ca3af;">None</td></tr>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Payslip ${esc(ps.employeeCode)} ${esc(period)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; padding: 32px; background: #f3f4f6; }
  .doc { max-width: 760px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; }
  .company { font-size: 22px; font-weight: 700; color: #111827; }
  .doc-title h1 { margin: 0; font-size: 24px; color: #4f46e5; text-align: right; }
  .doc-title .meta { font-size: 13px; color: #6b7280; text-align: right; margin-top: 4px; }
  .emp { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
  .emp .label { color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
  .cols { display: flex; gap: 24px; margin-bottom: 24px; }
  .cols > div { flex: 1; }
  h3 { font-size: 13px; color: #374151; margin: 0 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 0; font-size: 14px; border-bottom: 1px solid #f3f4f6; }
  td.num { text-align: right; }
  .subtotal td { font-weight: 700; border-top: 1px solid #d1d5db; }
  .net { background: #eef2ff; border-radius: 8px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .net .label { font-weight: 600; color: #3730a3; }
  .net .value { font-size: 20px; font-weight: 700; color: #3730a3; }
  .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
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
        <h1>PAYSLIP</h1>
        <div class="meta">${esc(period)}</div>
        <div class="meta">${esc(ps.status)}</div>
      </div>
    </div>

    <div class="emp">
      <div>
        <div class="label">Employee</div>
        <div><strong>${esc(ps.employeeName)}</strong> (${esc(ps.employeeCode)})</div>
      </div>
      <div style="text-align:right;">
        <div class="label">Days Worked / LOP</div>
        <div>${Number(ps.daysWorked ?? 0)} / ${Number(ps.lopDays ?? 0)}</div>
      </div>
    </div>

    <div class="cols">
      <div>
        <h3>Earnings</h3>
        <table>
          <tbody>
            ${lineRows(ps.earnings)}
            <tr class="subtotal"><td>Gross Earnings</td><td class="num">${money(ps.grossEarnings)}</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <h3>Deductions</h3>
        <table>
          <tbody>
            ${lineRows(ps.deductions)}
            <tr class="subtotal"><td>Total Deductions</td><td class="num">${money(ps.totalDeductions)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="net">
      <span class="label">Net Pay</span>
      <span class="value">${money(ps.netPay)}</span>
    </div>

    ${
      ps.employerContribs && ps.employerContribs.length
        ? `<div>
        <h3>Employer Contributions</h3>
        <table><tbody>
          ${lineRows(ps.employerContribs)}
          <tr class="subtotal"><td>Total Employer Cost</td><td class="num">${money(ps.employerContributions)}</td></tr>
        </tbody></table>
      </div>`
        : ''
    }

    <div class="footer">Generated by ${esc(companyName)} &mdash; This is a system-generated document.</div>
  </div>
</body>
</html>`;
}
