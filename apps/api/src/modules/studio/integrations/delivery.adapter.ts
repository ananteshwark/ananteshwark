import { Injectable, Logger } from '@nestjs/common';
import { DeliveryType } from './entities/integration.entity';

export interface DeliveryResult {
  delivered: boolean;
  transport: DeliveryType;
  reference?: string;
  reason?: string;
}

/**
 * Delivery seam for pushing script output to an external target (SFTP,
 * webhook). The default adapter is a safe no-op: it validates the target and
 * reports "not configured" rather than performing a real transfer, mirroring
 * the IRP/PEPPOL transmission seam. A real adapter can be provided in a
 * deployment that has SFTP/HTTP egress configured.
 */
@Injectable()
export class DeliveryAdapter {
  private readonly logger = new Logger(DeliveryAdapter.name);

  async deliver(type: DeliveryType, config: Record<string, any>, payload: any): Promise<DeliveryResult> {
    if (type === DeliveryType.NONE) return { delivered: false, transport: type, reason: 'No delivery target configured' };
    if (type === DeliveryType.SFTP && !config?.host) return { delivered: false, transport: type, reason: 'SFTP host is required' };
    if (type === DeliveryType.WEBHOOK && !config?.url) return { delivered: false, transport: type, reason: 'Webhook url is required' };
    // No-op default: a real transport is not wired in this deployment.
    const size = Array.isArray(payload) ? payload.length : 1;
    this.logger.log(`delivery seam: would send ${size} record(s) via ${type} (no transport wired)`);
    return { delivered: false, transport: type, reason: 'Delivery transport not wired in this deployment' };
  }
}
