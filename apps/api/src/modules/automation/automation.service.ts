import { Injectable, Logger, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationRule, RuleCondition, RuleAction } from './entities/automation-rule.entity';
import { AutomationRun, AutomationRunStatus } from './entities/automation-run.entity';
import { AUTOMATION_EVENTS, AUTOMATION_EVENT_KEYS } from './automation-events';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhooksService } from '../platform/webhooks/webhooks.service';
import { EmailService } from '../email/email.service';

/** Resolve a dot-path ("invoice.total") inside a payload object. */
function getPath(obj: any, path: string): any {
  if (!path) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/** Replace {{field}} placeholders with payload values. */
function renderTemplate(template: string, payload: Record<string, any>): string {
  return (template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p) => {
    const v = getPath(payload, p);
    return v === undefined || v === null ? '' : String(v);
  });
}

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    @InjectRepository(AutomationRule)
    private readonly ruleRepo: Repository<AutomationRule>,
    @InjectRepository(AutomationRun)
    private readonly runRepo: Repository<AutomationRun>,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly webhooksService?: WebhooksService,
    @Optional() private readonly emailService?: EmailService,
  ) {}

  // ─── Event emission (called by business workflows) ─────────────────────────

  /**
   * Fire a business event: evaluate matching tenant rules and forward to
   * webhook subscriptions. NEVER throws — automation must not break the
   * workflow that emitted the event.
   */
  async emit(tenantId: string, event: string, payload: Record<string, any> = {}): Promise<void> {
    try {
      // Always forward to webhook subscriptions (they filter by event type).
      try {
        await this.webhooksService?.dispatch(tenantId, event, payload);
      } catch {
        /* webhook delivery is best-effort */
      }

      const rules = await this.ruleRepo.find({
        where: { tenantId, triggerEvent: event, isActive: true },
      });
      for (const rule of rules) {
        if (!this.matches(rule.conditions ?? [], payload)) continue;
        await this.executeRule(rule, event, payload);
      }
    } catch (e: any) {
      this.logger.warn(`automation emit failed for ${event}: ${e?.message}`);
    }
  }

  /** All conditions must match (AND). An empty list always matches. */
  matches(conditions: RuleCondition[], payload: Record<string, any>): boolean {
    for (const c of conditions) {
      const actual = getPath(payload, c.field);
      switch (c.operator) {
        case 'exists':
          if (actual === undefined || actual === null) return false;
          break;
        case 'eq':
          // eslint-disable-next-line eqeqeq
          if (!(actual == c.value)) return false;
          break;
        case 'neq':
          // eslint-disable-next-line eqeqeq
          if (actual == c.value) return false;
          break;
        case 'gt':
          if (!(Number(actual) > Number(c.value))) return false;
          break;
        case 'gte':
          if (!(Number(actual) >= Number(c.value))) return false;
          break;
        case 'lt':
          if (!(Number(actual) < Number(c.value))) return false;
          break;
        case 'lte':
          if (!(Number(actual) <= Number(c.value))) return false;
          break;
        case 'contains':
          if (typeof actual !== 'string' || !actual.toLowerCase().includes(String(c.value).toLowerCase())) return false;
          break;
        default:
          return false;
      }
    }
    return true;
  }

  private async executeRule(rule: AutomationRule, event: string, payload: Record<string, any>): Promise<void> {
    const failures: string[] = [];
    for (const action of rule.actions ?? []) {
      try {
        await this.executeAction(rule.tenantId, action, event, payload);
      } catch (e: any) {
        failures.push(`${action.type}: ${e?.message}`);
      }
    }

    rule.runCount = (rule.runCount ?? 0) + 1;
    rule.lastRunAt = new Date();
    await this.ruleRepo.save(rule).catch(() => undefined);

    await this.runRepo
      .save(
        this.runRepo.create({
          tenantId: rule.tenantId,
          ruleId: rule.id,
          ruleName: rule.name,
          event,
          payload,
          status:
            failures.length === 0
              ? AutomationRunStatus.SUCCESS
              : failures.length === (rule.actions?.length ?? 0)
                ? AutomationRunStatus.FAILED
                : AutomationRunStatus.PARTIAL,
          detail: failures.length ? failures.join('; ') : null,
        }),
      )
      .catch(() => undefined);
  }

  private async executeAction(
    tenantId: string,
    action: RuleAction,
    event: string,
    payload: Record<string, any>,
  ): Promise<void> {
    const params = action.params ?? {};
    switch (action.type) {
      case 'NOTIFY': {
        if (!this.notificationsService) throw new Error('notifications unavailable');
        const userId = params.userId ?? getPath(payload, params.userIdField);
        if (!userId) throw new Error('no target user for NOTIFY');
        const title = renderTemplate(params.title ?? `Automation: ${event}`, payload);
        const body = renderTemplate(params.body ?? JSON.stringify(payload), payload);
        await this.notificationsService.sendInApp(tenantId, userId, title, body, { event });
        break;
      }
      case 'EMAIL': {
        if (!this.emailService) throw new Error('email unavailable');
        const to = params.to ?? getPath(payload, params.toField);
        if (!to) throw new Error('no recipient for EMAIL');
        await this.emailService.sendEmail(tenantId, to, params.templateCode ?? 'AUTOMATION_GENERIC', {
          event,
          ...payload,
        });
        break;
      }
      case 'WEBHOOK': {
        if (!this.webhooksService) throw new Error('webhooks unavailable');
        await this.webhooksService.dispatch(tenantId, params.event ?? event, payload);
        break;
      }
      default:
        throw new Error(`Unknown action type ${(action as any).type}`);
    }
  }

  // ─── Rule CRUD (controller) ─────────────────────────────────────────────────

  listEvents() {
    return AUTOMATION_EVENTS;
  }

  listRules(tenantId: string): Promise<AutomationRule[]> {
    return this.ruleRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async getRule(tenantId: string, id: string): Promise<AutomationRule> {
    const rule = await this.ruleRepo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`Automation rule ${id} not found`);
    return rule;
  }

  async createRule(tenantId: string, dto: Partial<AutomationRule>): Promise<AutomationRule> {
    if (!dto.name) throw new BadRequestException('name is required');
    if (!dto.triggerEvent || !AUTOMATION_EVENT_KEYS.has(dto.triggerEvent)) {
      throw new BadRequestException(`Unknown trigger event: ${dto.triggerEvent}`);
    }
    if (!dto.actions || dto.actions.length === 0) {
      throw new BadRequestException('At least one action is required');
    }
    const rule = this.ruleRepo.create({
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
      triggerEvent: dto.triggerEvent,
      conditions: dto.conditions ?? [],
      actions: dto.actions,
      isActive: dto.isActive ?? true,
    });
    return this.ruleRepo.save(rule);
  }

  async updateRule(tenantId: string, id: string, dto: Partial<AutomationRule>): Promise<AutomationRule> {
    const rule = await this.getRule(tenantId, id);
    if (dto.triggerEvent !== undefined && !AUTOMATION_EVENT_KEYS.has(dto.triggerEvent)) {
      throw new BadRequestException(`Unknown trigger event: ${dto.triggerEvent}`);
    }
    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.description !== undefined) rule.description = dto.description;
    if (dto.triggerEvent !== undefined) rule.triggerEvent = dto.triggerEvent;
    if (dto.conditions !== undefined) rule.conditions = dto.conditions;
    if (dto.actions !== undefined) rule.actions = dto.actions;
    if (dto.isActive !== undefined) rule.isActive = dto.isActive;
    return this.ruleRepo.save(rule);
  }

  async deleteRule(tenantId: string, id: string): Promise<void> {
    const rule = await this.getRule(tenantId, id);
    await this.ruleRepo.remove(rule);
  }

  /** Fire a rule once with a sample payload (bypasses the event bus). */
  async testRule(tenantId: string, id: string, payload: Record<string, any> = {}): Promise<{ matched: boolean }> {
    const rule = await this.getRule(tenantId, id);
    const matched = this.matches(rule.conditions ?? [], payload);
    if (matched) await this.executeRule(rule, rule.triggerEvent, payload);
    return { matched };
  }

  listRuns(tenantId: string, limit = 50): Promise<AutomationRun[]> {
    return this.runRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
  }
}
