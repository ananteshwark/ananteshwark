import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export interface IrpAck {
  ackNo: string;
  ackDate: string; // yyyy-mm-dd HH:mm:ss as returned by the IRP
  status: 'ACT';
}

/**
 * Transport seam for the Invoice Registration Portal. The GST service only
 * knows this interface; a production deployment binds a GSP/direct-API
 * implementation (auth token exchange, INV-01 POST, signed-QR handling)
 * against the same token without touching the register logic.
 */
export interface IrpTransport {
  transmit(einvoice: { irn: string; payload: Record<string, any> }): Promise<IrpAck>;
}

export const IRP_TRANSPORT = 'IRP_TRANSPORT';

/**
 * Default sandbox transport: acknowledges deterministically from the IRN so
 * repeated transmissions of the same document get the same ack — mirrors the
 * IRP's own dedup-by-IRN behavior and keeps tests reproducible.
 */
@Injectable()
export class SandboxIrpTransport implements IrpTransport {
  async transmit(einvoice: { irn: string; payload: Record<string, any> }): Promise<IrpAck> {
    const digits = BigInt('0x' + createHash('sha256').update(einvoice.irn).digest('hex').slice(0, 12))
      .toString()
      .padStart(15, '0')
      .slice(0, 15);
    return {
      ackNo: digits,
      ackDate: new Date().toISOString().slice(0, 19).replace('T', ' '),
      status: 'ACT',
    };
  }
}
