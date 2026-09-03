import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from './entities/channel.entity';

export interface ChannelSendResult { sent: boolean; reference?: string; reason?: string }

/**
 * Outbound notification channels. Teams and Slack have a REAL transport —
 * their incoming webhooks are a plain JSON POST — gated behind
 * CHANNEL_WEBHOOKS_ENABLED=true so deployments without egress keep the
 * safe not-wired default. Web push and other channels remain seams a
 * deployment can wire by overriding this provider.
 */
@Injectable()
export class ChannelAdapter {
  private readonly logger = new Logger(ChannelAdapter.name);
  /** Injectable for tests; the platform fetch otherwise. */
  fetchFn: typeof fetch = (url, init) => globalThis.fetch(url, init);

  private get webhooksEnabled(): boolean {
    return process.env.CHANNEL_WEBHOOKS_ENABLED === 'true';
  }

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

    const isWebhookChannel = channel === NotificationChannel.TEAMS || channel === NotificationChannel.SLACK;
    if (isWebhookChannel && this.webhooksEnabled) {
      return this.postWebhook(channel, String(target.webhookUrl), message);
    }

    this.logger.log(`channel seam: would send "${message.title}" via ${channel} (no transport wired)`);
    return { sent: false, reason: 'Channel transport not wired in this deployment' };
  }

  /**
   * Teams and Slack incoming webhooks both accept `{ text }`. The URL is
   * tenant-supplied, so require https and never send anything else to it.
   */
  private async postWebhook(channel: NotificationChannel, webhookUrl: string, message: { title: string; body: string }): Promise<ChannelSendResult> {
    if (!/^https:\/\//i.test(webhookUrl)) {
      return { sent: false, reason: 'webhookUrl must be an https URL' };
    }
    try {
      const res = await this.fetchFn(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `**${message.title}**\n\n${message.body}` }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return { sent: true, reference: `${channel}:${res.status}` };
      return { sent: false, reason: `Webhook responded with HTTP ${res.status}` };
    } catch (e: any) {
      this.logger.warn(`${channel} webhook delivery failed: ${e?.message ?? e}`);
      return { sent: false, reason: `Webhook delivery failed: ${e?.message ?? 'network error'}` };
    }
  }
}
