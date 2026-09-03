import {
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { QrService } from './qr.service';

/**
 * Generates QR codes for any ERP entity.
 * GET /platform/qr?entityType=PO&entityId=uuid&format=png|svg|json
 */
@Controller('platform/qr')
export class QrController {
  constructor(private readonly svc: QrService) {}

  @Get()
  async generate(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @Query('label') label?: string,
    @Query('format') format: 'png' | 'dataurl' | 'json' = 'dataurl',
    @Res() res?: Response,
  ) {
    const payload = { entityType: entityType ?? 'UNKNOWN', entityId: entityId ?? '', label };

    if (format === 'png') {
      const buf = await this.svc.generateBuffer(payload);
      res.set('Content-Type', 'image/png');
      res.send(buf);
      return;
    }

    const dataUrl = await this.svc.generateDataUrl(payload);
    if (format === 'json') {
      return res.json({ dataUrl, entityType, entityId });
    }
    // dataurl — return as JSON for easy use in <img src>
    return res.json({ dataUrl });
  }
}
