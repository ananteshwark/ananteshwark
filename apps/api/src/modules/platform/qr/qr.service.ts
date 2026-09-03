import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

export interface QrPayload {
  entityType: string;
  entityId: string;
  label?: string;
  extra?: Record<string, string>;
}

@Injectable()
export class QrService {
  async generateDataUrl(payload: QrPayload): Promise<string> {
    const content = JSON.stringify({
      t: payload.entityType,
      id: payload.entityId,
      ...(payload.label ? { l: payload.label } : {}),
      ...(payload.extra ?? {}),
    });
    return QRCode.toDataURL(content, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
      color: { dark: '#1e293b', light: '#ffffff' },
    });
  }

  async generateBuffer(payload: QrPayload): Promise<Buffer> {
    const content = JSON.stringify({
      t: payload.entityType,
      id: payload.entityId,
      ...(payload.label ? { l: payload.label } : {}),
      ...(payload.extra ?? {}),
    });
    return QRCode.toBuffer(content, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
    });
  }
}
