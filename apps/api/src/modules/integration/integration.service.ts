import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationAdapter, AdapterAuthType } from './entities/integration-adapter.entity';
import { IntegrationEvent, EventStatus } from './entities/integration-event.entity';

/** Ph-278 — pre-built connector templates. */
const CONNECTORS: Record<string, Partial<IntegrationAdapter>> = {
  SALESFORCE: { name: 'Salesforce', connector: 'SALESFORCE', authType: AdapterAuthType.OAUTH2, baseUrl: 'https://api.salesforce.com', pageSize: 200 },
  STRIPE: { name: 'Stripe', connector: 'STRIPE', authType: AdapterAuthType.API_KEY, baseUrl: 'https://api.stripe.com/v1', pageSize: 100 },
  SHOPIFY: { name: 'Shopify', connector: 'SHOPIFY', authType: AdapterAuthType.OAUTH2, baseUrl: 'https://{shop}.myshopify.com/admin/api', pageSize: 250 },
  QUICKBOOKS: { name: 'QuickBooks', connector: 'QUICKBOOKS', authType: AdapterAuthType.OAUTH2, baseUrl: 'https://quickbooks.api.intuit.com', pageSize: 100 },
  JIRA: { name: 'JIRA', connector: 'JIRA', authType: AdapterAuthType.BASIC, baseUrl: 'https://{site}.atlassian.net/rest/api/3', pageSize: 50 },
};

@Injectable()
export class IntegrationService {
  constructor(
    @InjectRepository(IntegrationAdapter) private readonly adapterRepo: Repository<IntegrationAdapter>,
    @InjectRepository(IntegrationEvent) private readonly eventRepo: Repository<IntegrationEvent>,
  ) {}

  // ─── Ph-277/278: adapters + connectors ────────────────────────────

  listAdapters(tenantId: string): Promise<IntegrationAdapter[]> {
    return this.adapterRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async createAdapter(tenantId: string, data: Partial<IntegrationAdapter>): Promise<IntegrationAdapter> {
    if (!data.code?.trim() || !data.name?.trim()) throw new BadRequestException('code and name are required');
    const dup = await this.adapterRepo.findOne({ where: { tenantId, code: data.code } });
    if (dup) throw new BadRequestException('Adapter code already exists');
    const a = this.adapterRepo.create({
      tenantId, code: data.code, name: data.name, connector: data.connector ?? 'CUSTOM',
      authType: data.authType ?? AdapterAuthType.API_KEY, baseUrl: data.baseUrl ?? null,
      pageSize: data.pageSize ?? 100, maxRetries: data.maxRetries ?? 3, config: data.config ?? {}, isActive: true,
    } as any) as unknown as IntegrationAdapter;
    return (this.adapterRepo.save(a) as unknown) as Promise<IntegrationAdapter>;
  }

  listConnectorTemplates(): any[] {
    return Object.entries(CONNECTORS).map(([key, c]) => ({ key, ...c }));
  }

  /** Instantiate an adapter from a pre-built connector template. */
  async createFromConnector(tenantId: string, connectorKey: string, code: string, config: any = {}): Promise<IntegrationAdapter> {
    const tpl = CONNECTORS[connectorKey];
    if (!tpl) throw new BadRequestException(`Unknown connector "${connectorKey}"`);
    return this.createAdapter(tenantId, { ...tpl, code, config });
  }

  // ─── Ph-279: event streaming ──────────────────────────────────────

  async publishEvent(tenantId: string, adapterId: string, eventType: string, payload: any): Promise<IntegrationEvent> {
    const adapter = await this.adapterRepo.findOne({ where: { id: adapterId, tenantId } });
    if (!adapter) throw new NotFoundException('Adapter not found');
    if (!adapter.isActive) throw new BadRequestException('Adapter is inactive');
    const e = this.eventRepo.create({
      tenantId, adapterId, eventType, payload: payload ?? {}, status: EventStatus.PENDING, attempts: 0, lastError: null, deliveredAt: null,
    } as any) as unknown as IntegrationEvent;
    return (this.eventRepo.save(e) as unknown) as Promise<IntegrationEvent>;
  }

  /**
   * Attempt delivery of an event. `success` simulates the downstream result.
   * A failure increments attempts and moves the event to DEAD_LETTER once the
   * adapter's maxRetries is exhausted.
   */
  async attemptDelivery(tenantId: string, id: string, success: boolean, at: string, error?: string): Promise<IntegrationEvent> {
    const e = await this.eventRepo.findOne({ where: { id, tenantId } });
    if (!e) throw new NotFoundException('Event not found');
    if (e.status === EventStatus.DELIVERED || e.status === EventStatus.DEAD_LETTER) throw new BadRequestException(`Event is already ${e.status}`);
    const adapter = await this.adapterRepo.findOne({ where: { id: e.adapterId, tenantId } });
    const maxRetries = adapter?.maxRetries ?? 3;
    e.attempts += 1;
    if (success) {
      e.status = EventStatus.DELIVERED; e.deliveredAt = new Date(at); e.lastError = null;
    } else {
      e.lastError = error ?? 'delivery failed';
      e.status = e.attempts >= maxRetries ? EventStatus.DEAD_LETTER : EventStatus.FAILED;
    }
    return (this.eventRepo.save(e) as unknown) as Promise<IntegrationEvent>;
  }

  /** Requeue a dead-letter event for another delivery cycle. */
  async replayDeadLetter(tenantId: string, id: string): Promise<IntegrationEvent> {
    const e = await this.eventRepo.findOne({ where: { id, tenantId } });
    if (!e) throw new NotFoundException('Event not found');
    if (e.status !== EventStatus.DEAD_LETTER) throw new BadRequestException('Only dead-letter events can be replayed');
    e.status = EventStatus.PENDING; e.attempts = 0; e.lastError = null;
    return (this.eventRepo.save(e) as unknown) as Promise<IntegrationEvent>;
  }

  listEvents(tenantId: string, adapterId?: string, status?: EventStatus): Promise<IntegrationEvent[]> {
    const where: any = { tenantId };
    if (adapterId) where.adapterId = adapterId;
    if (status) where.status = status;
    return this.eventRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  // ─── Ph-280: monitoring ───────────────────────────────────────────

  async monitoring(tenantId: string): Promise<any> {
    const [adapters, events] = await Promise.all([
      this.adapterRepo.find({ where: { tenantId } }),
      this.eventRepo.find({ where: { tenantId } }),
    ]);
    const perAdapter = adapters.map((a) => {
      const ev = events.filter((e) => e.adapterId === a.id);
      const count = (s: EventStatus) => ev.filter((e) => e.status === s).length;
      const delivered = count(EventStatus.DELIVERED);
      const total = ev.length;
      return {
        adapterId: a.id, code: a.code, connector: a.connector,
        total, delivered, pending: count(EventStatus.PENDING), failed: count(EventStatus.FAILED), deadLetter: count(EventStatus.DEAD_LETTER),
        successRate: total > 0 ? Math.round((delivered / total) * 10000) / 100 : null,
      };
    });
    const deadLetterQueue = events.filter((e) => e.status === EventStatus.DEAD_LETTER).map((e) => ({ id: e.id, adapterId: e.adapterId, eventType: e.eventType, attempts: e.attempts, lastError: e.lastError }));
    return { adapters: perAdapter, deadLetterCount: deadLetterQueue.length, deadLetterQueue };
  }
}
