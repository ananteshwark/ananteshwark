import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { WebhookSubscription } from './entities/webhook-subscription.entity';
import {
  WebhookDelivery,
  WebhookDeliveryStatus,
} from './entities/webhook-delivery.entity';
import {
  CreateWebhookSubscriptionDto,
  UpdateWebhookSubscriptionDto,
} from './dto/webhooks.dto';

// Supported event types — extend as more modules fire events
export const WEBHOOK_EVENTS = [
  'employee.created',
  'employee.updated',
  'employee.offboarded',
  'leave.approved',
  'leave.rejected',
  'payroll.run.completed',
  'po.approved',
  'po.rejected',
  'grn.created',
  'vendor_invoice.posted',
  'vendor_invoice.paid',
  'ar_invoice.posted',
  'ar_invoice.paid',
  'expense.approved',
  'asset.disposed',
  'consolidation.completed',
];

function generateSecret(): string {
  return crypto.randomBytes(24).toString('hex');
}

function hmacSignature(secret: string, body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(WebhookSubscription)
    private readonly subRepo: Repository<WebhookSubscription>,
    @InjectRepository(WebhookDelivery)
    private readonly delRepo: Repository<WebhookDelivery>,
  ) {}

  // ─── Subscriptions ───────────────────────────────────────────────────────────

  listSubscriptions(tenantId: string): Promise<WebhookSubscription[]> {
    return this.subRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async getSubscription(tenantId: string, id: string): Promise<WebhookSubscription> {
    const sub = await this.subRepo.findOne({ where: { id, tenantId } });
    if (!sub) throw new NotFoundException(`Webhook subscription ${id} not found`);
    return sub;
  }

  async createSubscription(
    tenantId: string,
    dto: CreateWebhookSubscriptionDto,
  ): Promise<WebhookSubscription> {
    const sub = this.subRepo.create({
      tenantId,
      name: dto.name,
      targetUrl: dto.targetUrl,
      eventTypes: dto.eventTypes,
      secret: generateSecret(),
      isActive: true,
      maxRetries: dto.maxRetries ?? 3,
    });
    return this.subRepo.save(sub);
  }

  async updateSubscription(
    tenantId: string,
    id: string,
    dto: UpdateWebhookSubscriptionDto,
  ): Promise<WebhookSubscription> {
    const sub = await this.getSubscription(tenantId, id);
    if (dto.name !== undefined) sub.name = dto.name;
    if (dto.targetUrl !== undefined) sub.targetUrl = dto.targetUrl;
    if (dto.eventTypes !== undefined) sub.eventTypes = dto.eventTypes;
    if (dto.isActive !== undefined) sub.isActive = dto.isActive;
    if (dto.maxRetries !== undefined) sub.maxRetries = dto.maxRetries;
    return this.subRepo.save(sub);
  }

  async rotateSecret(tenantId: string, id: string): Promise<WebhookSubscription> {
    const sub = await this.getSubscription(tenantId, id);
    sub.secret = generateSecret();
    return this.subRepo.save(sub);
  }

  async deleteSubscription(tenantId: string, id: string): Promise<void> {
    const sub = await this.getSubscription(tenantId, id);
    await this.delRepo.delete({ subscriptionId: sub.id });
    await this.subRepo.remove(sub);
  }

  // ─── Deliveries ──────────────────────────────────────────────────────────────

  listDeliveries(
    tenantId: string,
    subscriptionId?: string,
    limit = 50,
  ): Promise<WebhookDelivery[]> {
    const where: any = { tenantId };
    if (subscriptionId) where.subscriptionId = subscriptionId;
    return this.delRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getDelivery(tenantId: string, id: string): Promise<WebhookDelivery> {
    const del = await this.delRepo.findOne({ where: { id, tenantId } });
    if (!del) throw new NotFoundException(`Webhook delivery ${id} not found`);
    return del;
  }

  // ─── Event dispatch ──────────────────────────────────────────────────────────

  /**
   * Fire an event for all active subscriptions that listen to this event type.
   * Delivery is attempted inline (async-safe); failures are recorded in the
   * delivery log with retry scheduling.
   */
  async dispatch(
    tenantId: string,
    eventType: string,
    payload: Record<string, any>,
  ): Promise<void> {
    const subs = await this.subRepo.find({
      where: { tenantId, isActive: true },
    });

    const matching = subs.filter(
      (s) =>
        s.eventTypes.includes(eventType) || s.eventTypes.includes('*'),
    );

    await Promise.allSettled(
      matching.map((sub) => this.attemptDelivery(sub, eventType, payload)),
    );
  }

  private async attemptDelivery(
    sub: WebhookSubscription,
    eventType: string,
    payload: Record<string, any>,
    existingDelivery?: WebhookDelivery,
  ): Promise<void> {
    const body = JSON.stringify({
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload,
    });
    const sig = hmacSignature(sub.secret, body);

    let delivery =
      existingDelivery ??
      (await this.delRepo.save(
        this.delRepo.create({
          tenantId: sub.tenantId,
          subscriptionId: sub.id,
          eventType,
          payload,
          status: WebhookDeliveryStatus.PENDING,
          attemptCount: 0,
        }),
      ));

    try {
      // Use native fetch (Node 18+)
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const resp = await fetch(sub.targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': sig,
          'X-Webhook-Event': eventType,
          'X-Webhook-Delivery': delivery.id,
        },
        body,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      delivery.httpStatus = resp.status;
      delivery.responseBody = await resp.text().catch(() => null);
      delivery.attemptCount += 1;

      if (resp.ok) {
        delivery.status = WebhookDeliveryStatus.SUCCESS;
        delivery.errorMessage = null;
        delivery.nextRetryAt = null;
      } else {
        this.scheduleRetry(delivery, sub.maxRetries, `HTTP ${resp.status}`);
      }
    } catch (err) {
      delivery.attemptCount += 1;
      this.scheduleRetry(
        delivery,
        sub.maxRetries,
        err instanceof Error ? err.message : String(err),
      );
    }

    await this.delRepo.save(delivery);
  }

  private scheduleRetry(
    delivery: WebhookDelivery,
    maxRetries: number,
    errorMessage: string,
  ): void {
    delivery.errorMessage = errorMessage;
    if (delivery.attemptCount >= maxRetries) {
      delivery.status = WebhookDeliveryStatus.FAILED;
      delivery.nextRetryAt = null;
    } else {
      delivery.status = WebhookDeliveryStatus.RETRYING;
      // Exponential backoff: 2^attempt minutes
      const delayMs = Math.pow(2, delivery.attemptCount) * 60_000;
      delivery.nextRetryAt = new Date(Date.now() + delayMs);
    }
  }

  // ─── Test endpoint ───────────────────────────────────────────────────────────

  async testSubscription(tenantId: string, id: string): Promise<WebhookDelivery> {
    const sub = await this.getSubscription(tenantId, id);
    const delivery = await this.delRepo.save(
      this.delRepo.create({
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        eventType: 'webhook.test',
        payload: { message: 'This is a test delivery from the ERP platform' },
        status: WebhookDeliveryStatus.PENDING,
        attemptCount: 0,
      }),
    );
    await this.attemptDelivery(
      sub,
      'webhook.test',
      { message: 'This is a test delivery from the ERP platform' },
      delivery,
    );
    return this.delRepo.findOne({ where: { id: delivery.id } }) as Promise<WebhookDelivery>;
  }

  listEventTypes(): string[] {
    return WEBHOOK_EVENTS;
  }
}
