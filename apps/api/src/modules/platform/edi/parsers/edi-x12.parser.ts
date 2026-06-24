/**
 * Minimal X12 EDI parser/builder for transaction sets:
 *   850 – Purchase Order
 *   855 – Purchase Order Acknowledgment
 *   856 – Ship Notice / Manifest (ASN)
 *   810 – Invoice
 *
 * This implementation handles the essential segments for ERP integration.
 * Full X12 compliance would require a certified EDI library.
 */

export interface X12Segment {
  id: string;
  elements: string[];
}

export interface Edi850LineItem {
  lineNumber: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  productCode: string;
  description: string;
}

export interface Edi850 {
  purchaseOrderNumber: string;
  purchaseOrderDate: string;
  vendorPartnerId: string;
  buyerPartnerId: string;
  shipTo?: string;
  currency: string;
  lineItems: Edi850LineItem[];
}

export interface Edi855 {
  acknowledgmentNumber: string;
  purchaseOrderNumber: string;
  acknowledgmentDate: string;
  acknowledgmentCode: string; // AC = Acknowledged, RD = Rejected
  lineItems: Array<{
    lineNumber: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    productCode: string;
    status: string; // IA = Accepted, IR = Rejected
  }>;
}

export interface Edi856ShipLine {
  lineNumber: string;
  quantity: number;
  unit: string;
  productCode: string;
}

export interface Edi856 {
  shipmentId: string;
  shipDate: string;
  carrierCode: string;
  trackingNumber: string;
  purchaseOrderNumber: string;
  lines: Edi856ShipLine[];
}

export interface Edi810LineItem {
  lineNumber: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  productCode: string;
  description: string;
}

export interface Edi810 {
  invoiceNumber: string;
  invoiceDate: string;
  purchaseOrderNumber: string;
  vendorPartnerId: string;
  buyerPartnerId: string;
  currency: string;
  totalAmount: number;
  taxAmount: number;
  lineItems: Edi810LineItem[];
}

// ---------------------------------------------------------------------------
// Tokeniser
// ---------------------------------------------------------------------------

export function parseX12(raw: string): X12Segment[] {
  // X12 uses * as element separator, ~ as segment terminator by convention
  const normalized = raw.replace(/\r\n|\r/g, '\n').trim();
  const segmentStrings = normalized.split('~').map((s) => s.trim()).filter(Boolean);
  return segmentStrings.map((seg) => {
    const elements = seg.split('*');
    return { id: elements[0], elements: elements.slice(1) };
  });
}

function el(seg: X12Segment, idx: number): string {
  return seg.elements[idx] ?? '';
}

// ---------------------------------------------------------------------------
// Transaction set parsers
// ---------------------------------------------------------------------------

export function parseEdi850(raw: string): Edi850 {
  const segments = parseX12(raw);
  let poNumber = '';
  let poDate = '';
  let vendorId = '';
  let buyerId = '';
  let currency = 'USD';
  const lineItems: Edi850LineItem[] = [];

  for (const seg of segments) {
    if (seg.id === 'BEG') {
      poNumber = el(seg, 2);
      poDate = el(seg, 4);
    } else if (seg.id === 'CUR') {
      currency = el(seg, 1) || 'USD';
    } else if (seg.id === 'N1') {
      if (el(seg, 0) === 'SE') vendorId = el(seg, 3);
      if (el(seg, 0) === 'BY') buyerId = el(seg, 3);
    } else if (seg.id === 'PO1') {
      lineItems.push({
        lineNumber: el(seg, 0),
        quantity: parseFloat(el(seg, 1)) || 0,
        unit: el(seg, 2),
        unitPrice: parseFloat(el(seg, 3)) || 0,
        productCode: el(seg, 6),
        description: el(seg, 8),
      });
    }
  }

  return { purchaseOrderNumber: poNumber, purchaseOrderDate: poDate, vendorPartnerId: vendorId, buyerPartnerId: buyerId, currency, lineItems };
}

export function parseEdi855(raw: string): Edi855 {
  const segments = parseX12(raw);
  let ackNumber = '';
  let poNumber = '';
  let ackDate = '';
  let ackCode = '';
  const lineItems: Edi855['lineItems'] = [];

  for (const seg of segments) {
    if (seg.id === 'BAK') {
      ackCode = el(seg, 1);
      poNumber = el(seg, 2);
      ackDate = el(seg, 3);
      ackNumber = el(seg, 8) || poNumber;
    } else if (seg.id === 'PO1') {
      lineItems.push({
        lineNumber: el(seg, 0),
        quantity: parseFloat(el(seg, 1)) || 0,
        unit: el(seg, 2),
        unitPrice: parseFloat(el(seg, 3)) || 0,
        productCode: el(seg, 6),
        status: 'IA',
      });
    } else if (seg.id === 'ACK') {
      if (lineItems.length) lineItems[lineItems.length - 1].status = el(seg, 0);
    }
  }

  return { acknowledgmentNumber: ackNumber, purchaseOrderNumber: poNumber, acknowledgmentDate: ackDate, acknowledgmentCode: ackCode, lineItems };
}

export function parseEdi856(raw: string): Edi856 {
  const segments = parseX12(raw);
  let shipmentId = '';
  let shipDate = '';
  let carrierCode = '';
  let trackingNumber = '';
  let poNumber = '';
  const lines: Edi856ShipLine[] = [];

  for (const seg of segments) {
    if (seg.id === 'BSN') {
      shipmentId = el(seg, 1);
      shipDate = el(seg, 2);
    } else if (seg.id === 'TD5') {
      carrierCode = el(seg, 2);
      trackingNumber = el(seg, 4);
    } else if (seg.id === 'PRF') {
      poNumber = el(seg, 0);
    } else if (seg.id === 'SN1') {
      lines.push({
        lineNumber: el(seg, 0),
        quantity: parseFloat(el(seg, 1)) || 0,
        unit: el(seg, 2),
        productCode: '',
      });
    } else if (seg.id === 'LIN' && lines.length) {
      lines[lines.length - 1].productCode = el(seg, 2);
    }
  }

  return { shipmentId, shipDate, carrierCode, trackingNumber, purchaseOrderNumber: poNumber, lines };
}

export function parseEdi810(raw: string): Edi810 {
  const segments = parseX12(raw);
  let invoiceNumber = '';
  let invoiceDate = '';
  let poNumber = '';
  let vendorId = '';
  let buyerId = '';
  let currency = 'USD';
  let totalAmount = 0;
  let taxAmount = 0;
  const lineItems: Edi810LineItem[] = [];

  for (const seg of segments) {
    if (seg.id === 'BIG') {
      invoiceDate = el(seg, 0);
      invoiceNumber = el(seg, 1);
      poNumber = el(seg, 3);
    } else if (seg.id === 'CUR') {
      currency = el(seg, 1) || 'USD';
    } else if (seg.id === 'N1') {
      if (el(seg, 0) === 'SE') vendorId = el(seg, 3);
      if (el(seg, 0) === 'BY') buyerId = el(seg, 3);
    } else if (seg.id === 'IT1') {
      lineItems.push({
        lineNumber: el(seg, 0),
        quantity: parseFloat(el(seg, 1)) || 0,
        unit: el(seg, 2),
        unitPrice: parseFloat(el(seg, 3)) || 0,
        amount: parseFloat(el(seg, 3)) * (parseFloat(el(seg, 1)) || 0),
        productCode: el(seg, 6),
        description: el(seg, 8),
      });
    } else if (seg.id === 'TDS') {
      totalAmount = parseFloat(el(seg, 0)) / 100 || 0;
    } else if (seg.id === 'TXI') {
      taxAmount += parseFloat(el(seg, 1)) || 0;
    }
  }

  return { invoiceNumber, invoiceDate, purchaseOrderNumber: poNumber, vendorPartnerId: vendorId, buyerPartnerId: buyerId, currency, totalAmount, taxAmount, lineItems };
}

// ---------------------------------------------------------------------------
// Outbound builder: EDI 850 (Purchase Order)
// ---------------------------------------------------------------------------

function pad(str: string, len: number, char = ' '): string {
  return str.padEnd(len, char).substring(0, len);
}

function ediDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function ediTime(d: Date): string {
  return d.toISOString().slice(11, 16).replace(':', '');
}

export function buildEdi850(data: {
  senderId: string;
  senderQualifier: string;
  receiverId: string;
  receiverQualifier: string;
  controlNumber: string;
  purchaseOrderNumber: string;
  vendorName?: string;
  buyerName?: string;
  lineItems: Array<{
    lineNumber: number;
    quantity: number;
    unit: string;
    unitPrice: number;
    productCode: string;
    description?: string;
  }>;
}): string {
  const now = new Date();
  const date = ediDate(now);
  const time = ediTime(now);
  const ctrl = data.controlNumber.padStart(9, '0');
  const groupCtrl = ctrl;

  const segments: string[] = [
    `ISA*00*${pad('', 10)}*00*${pad('', 10)}*${data.senderQualifier}*${pad(data.senderId, 15)}*${data.receiverQualifier}*${pad(data.receiverId, 15)}*${date.slice(2)}*${time}*^*00501*${ctrl}*0*P*>`,
    `GS*PO*${data.senderId}*${data.receiverId}*${date}*${time}*${groupCtrl}*X*005010X222A1`,
    `ST*850*0001`,
    `BEG*00*NE*${data.purchaseOrderNumber}**${date}`,
    `CUR*BY*USD`,
    data.vendorName ? `N1*SE*${data.vendorName}*92*${data.receiverId}` : `N1*SE**92*${data.receiverId}`,
    data.buyerName ? `N1*BY*${data.buyerName}*92*${data.senderId}` : `N1*BY**92*${data.senderId}`,
  ];

  for (const item of data.lineItems) {
    segments.push(
      `PO1*${item.lineNumber}*${item.quantity}*${item.unit}*${item.unitPrice.toFixed(2)}*PE*VN*${item.productCode}***PI*${item.description ?? ''}`,
    );
  }

  const lineCount = segments.length - 3; // exclude ISA, GS, ST
  segments.push(`CTT*${data.lineItems.length}`);
  segments.push(`SE*${lineCount + 2}*0001`);
  segments.push(`GE*1*${groupCtrl}`);
  segments.push(`IEA*1*${ctrl}`);

  return segments.join('~\n') + '~';
}
