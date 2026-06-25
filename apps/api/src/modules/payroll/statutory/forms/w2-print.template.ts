interface W2PrintData {
  taxYear: number;
  recipientName: string;
  data: Record<string, any>;
  companyName: string;
}

const money = (n: any) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(n ?? 0),
  );

const esc = (s: any) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Render a printable HTML facsimile of IRS Form W-2 (boxes 1–20). */
export function renderW2Print(d: W2PrintData): string {
  const box = (n: string, label: string, value: string) => `
    <div class="box">
      <div class="box-label"><span class="box-num">${n}</span> ${esc(label)}</div>
      <div class="box-value">${value}</div>
    </div>`;
  const data = d.data ?? {};
  const addr = data.address ?? {};
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>W-2 ${d.taxYear} — ${esc(d.recipientName)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; max-width: 760px; }
    .box { border: 1px solid #999; border-radius: 4px; padding: 6px 8px; }
    .box-label { font-size: 10px; color: #555; text-transform: uppercase; }
    .box-num { display: inline-block; background: #111; color: #fff; padding: 0 4px; border-radius: 2px; font-size: 9px; }
    .box-value { font-size: 15px; font-weight: 600; margin-top: 2px; }
    .full { grid-column: 1 / -1; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 16px 0; }
    .party { border: 1px solid #ccc; border-radius: 4px; padding: 8px; font-size: 12px; }
    .party h3 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; color: #555; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Form W-2 — Wage and Tax Statement</h1>
  <div class="sub">Tax Year ${d.taxYear} &middot; ${esc(d.companyName)}</div>

  <div class="parties">
    <div class="party">
      <h3>Employer ${data.employerEin ? `(EIN ${esc(data.employerEin)})` : ''}</h3>
      ${esc(data.employerName || d.companyName)}
    </div>
    <div class="party">
      <h3>Employee ${data.employeeSsn ? `(SSN ${esc(data.employeeSsn)})` : ''}</h3>
      ${esc(d.recipientName)}<br/>
      ${esc(addr.line1 || '')} ${esc(addr.line2 || '')}<br/>
      ${esc(addr.city || '')} ${esc(addr.state || '')} ${esc(addr.zip || '')}
    </div>
  </div>

  <div class="grid">
    ${box('1', 'Wages, tips, other comp.', money(data.box1))}
    ${box('2', 'Federal income tax withheld', money(data.box2))}
    ${box('3', 'Social security wages', money(data.box3))}
    ${box('4', 'Social security tax withheld', money(data.box4))}
    ${box('5', 'Medicare wages and tips', money(data.box5))}
    ${box('6', 'Medicare tax withheld', money(data.box6))}
    ${box('15', 'State', esc(data.stateCode || ''))}
    ${box('16', 'State wages, tips, etc.', money(data.box16))}
    ${box('17', 'State income tax', money(data.box17))}
    ${box('18', 'Local wages, tips, etc.', money(data.box18))}
    ${box('19', 'Local income tax', money(data.box19))}
  </div>
</body>
</html>`;
}
