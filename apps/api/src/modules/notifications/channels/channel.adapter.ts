import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from './entities/channel.entity';

export interface ChannelSendResult { sent: boolean; reference?: string; reason?: string }

/**
 * Outbound notification-channel seam. The default adapter validates the target
 * for each channel and reports "not wired" rather than performing a real send —
 * mirroring the delivery/transmission seams elsewhere. A deployment with Teams/
 * Slack/web-push egress can provide a real adapter without changing callers.
 */
@Injectable()
export class ChannelAdapter {
  private readonly logger = new Logger(ChannelAdapter.name);

  /** Validate a target for a channel; returns an error string or null. */
  static validateTarget(channel: NotificationChannel, target: Record<string, any>): string | null {
    switch (channel) {
      case NotificationChannel.TEAMS:
      case NotificationChannel.SLACK:
        return target?.webhookUrl ? null : 'webhookUrl is required';
      case NotificationChannel.WEB_PUSH:
        return target?.endpoint ? null : 'push endpoint is required';
      case NotificationChannel.EMAIL:
        return target?.address ? null : 'email address is required';
      default:
        return 'unknown channel';
    }
  }

  async send(channel: NotificationChannel, target: Record<string, any>, message: { title: string; body: string }): Promise<ChannelSendResult> {
    const err = ChannelAdapter.validateTarget(channel, target);
    if (err) return { sent: false, reason: err };
    this.logger.log(`channel seam: would send "${message.title}" via ${channel} (no transport wired)`);
    return { sent: false, reason: 'Channel transport not wired in this deployment' };
  }
}
