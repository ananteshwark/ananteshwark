import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SlaRule, SlaEventClass, SlaLineType } from './entities/sla-rule.entity';
import { XlaAccountingEvent } from './entities/xla-accounting-event.entity';

export interface SlaDerivationResult {
  accountId: string;
  ruleId: string | null;
  ruleName: string | null;
  derivedViaRule: boolean;
}

export interface XlaLogInput {
  tenantId: string;
  eventClass: SlaEventClass;
  sourceDocumentId: string;
  sourceDocumentType: string;
  accountId: string;
  accountCode?: string;
  debit?: number;
  credit?: number;
  journalEntryId?: string;
  journalLineId?: string;
  slaRuleId?: string;
  slaRuleName?: string;
  eventData?: any;
}

@Injectable()
export class SlaService {
  constructor(
    @InjectRepository(SlaRule)
    private readonly ruleRepo: Repository<SlaRule>,
    @InjectRepository(XlaAccountingEvent)
    private readonly xlaRepo: Repository<XlaAccountingEvent>,
  ) {}

  // ─── Rule CRUD ─────────────────────────────────────────────────────

  async listRules(tenantId: string, eventClass?: SlaEventClass): Promise<SlaRule[]> {
    const where: any = { tenantId };
    if (eventClass) where.eventClass = eventClass;
    return this.ruleRepo.find({ where, order: { eventClass: 'ASC', priority: 'ASC' } });
  }

  async getRule(tenantId: string, id: string): Promise<SlaRule> {
    const rule = await this.ruleRepo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`SLA rule ${id} not found`);
    return rule;
  }

  async createRule(tenantId: string, data: {
    name: string;
    description?: string;
    eventClass: SlaEventClass;
    lineType: SlaLineType;
    priority?: number;
    accountId: string;
    conditionExpression?: any;
    isActive?: boolean;
  }): Promise<SlaRule> {
    if (!data.accountId) throw new BadRequestException('accountId is required');
    if (!Object.values(SlaEventClass).includes(data.eventClass)) {
      throw new BadRequestException(`Invalid eventClass: ${data.eventClass}`);
    }
    if (!Object.values(SlaLineType).includes(data.lineType)) {
      throw new BadRequestException(`Invalid lineType: ${data.lineType}`);
    }
    if (data.conditionExpression) {
      this.validateConditionExpression(data.conditionExpression);
    }
    const rule = this.ruleRepo.create({
      tenantId,
      name: data.name,
      description: data.description ?? null,
      eventClass: data.eventClass,
      lineType: data.lineType,
      priority: data.priority ?? 50,
      accountId: data.accountId,
      conditionExpression: data.conditionExpression ?? null,
      isActive: data.isActive !== false,
    } as any) as unknown as SlaRule;
    return (this.ruleRepo.save(rule) as unknown) as Promise<SlaRule>;
  }

  async updateRule(tenantId: string, id: string, data: Partial<{
    name: string;
    description: string;
    priority: number;
    accountId: string;
    conditionExpression: any;
    isActive: boolean;
  }>): Promise<SlaRule> {
    const rule = await this.getRule(tenantId, id);
    if (data.conditionExpression !== undefined) {
      this.validateConditionExpression(data.conditionExpression);
    }
    Object.assign(rule, data);
    return (this.ruleRepo.save(rule) as unknown) as Promise<SlaRule>;
  }

  async deleteRule(tenantId: string, id: string): Promise<void> {
    const rule = await this.getRule(tenantId, id);
    await this.ruleRepo.remove(rule);
  }

  // ─── Account Derivation Engine ─────────────────────────────────────

  /**
   * Evaluates all active rules for (tenantId, eventClass, lineType) in priority order.
   * Returns the first rule whose conditionExpression matches eventContext.
   * Returns null if no rule matches — caller falls back to DEFAULT_ACCOUNT_CODES.
   */
  async deriveAccount(
    tenantId: string,
    eventClass: SlaEventClass,
    lineType: SlaLineType,
    eventContext: Record<string, any>,
  ): Promise<SlaDerivationResult | null> {
    const rules = await this.ruleRepo.find({
      where: { tenantId, eventClass, lineType, isActive: true },
      order: { priority: 'ASC' },
    });

    for (const rule of rules) {
      if (!rule.accountId) continue;
      const matches = rule.conditionExpression === null
        ? true
        : this.evaluateCondition(rule.conditionExpression, eventContext);
      if (matches) {
        return {
          accountId: rule.accountId,
          ruleId: rule.id,
          ruleName: rule.name,
          derivedViaRule: true,
        };
      }
    }
    return null;
  }

  // ─── Audit Trail ───────────────────────────────────────────────────

  async logAccountingEvent(input: XlaLogInput): Promise<XlaAccountingEvent> {
    const event = this.xlaRepo.create({
      tenantId: input.tenantId,
      eventClass: input.eventClass,
      sourceDocumentId: input.sourceDocumentId,
      sourceDocumentType: input.sourceDocumentType,
      journalEntryId: input.journalEntryId ?? null,
      journalLineId: input.journalLineId ?? null,
      slaRuleId: input.slaRuleId ?? null,
      slaRuleName: input.slaRuleName ?? null,
      accountId: input.accountId,
      accountCode: input.accountCode ?? null,
      debit: input.debit ?? 0,
      credit: input.credit ?? 0,
      eventData: input.eventData ?? null,
      processedAt: new Date(),
    } as any) as unknown as XlaAccountingEvent;
    return (this.xlaRepo.save(event) as unknown) as Promise<XlaAccountingEvent>;
  }

  async getAuditTrail(
    tenantId: string,
    params: {
      sourceDocumentId?: string;
      journalEntryId?: string;
      eventClass?: SlaEventClass;
      limit?: number;
    },
  ): Promise<XlaAccountingEvent[]> {
    const qb = this.xlaRepo
      .createQueryBuilder('xla')
      .where('xla.tenant_id = :tenantId', { tenantId })
      .orderBy('xla.created_at', 'DESC')
      .take(params.limit ?? 200);

    if (params.sourceDocumentId) {
      qb.andWhere('xla.source_document_id = :sid', { sid: params.sourceDocumentId });
    }
    if (params.journalEntryId) {
      qb.andWhere('xla.journal_entry_id = :jeid', { jeid: params.journalEntryId });
    }
    if (params.eventClass) {
      qb.andWhere('xla.event_class = :ec', { ec: params.eventClass });
    }
    return qb.getMany();
  }

  // ─── Condition Evaluator ───────────────────────────────────────────

  /**
   * Recursively evaluate a condition expression against an event context object.
   *
   * Supported node shapes:
   *   Leaf:  {"field": "currency", "op": "eq", "value": "USD"}
   *   AND:   {"and": [leaf, leaf, ...]}
   *   OR:    {"or":  [leaf, leaf, ...]}
   *   NOT:   {"not": leaf}
   *
   * Supported ops: eq, neq, gt, gte, lt, lte, in, nin, contains, startsWith
   * Field path supports dot notation: "vendor.category" resolves context.vendor?.category
   */
  evaluateCondition(expr: any, context: Record<string, any>): boolean {
    if (!expr || typeof expr !== 'object') return true;

    if (Array.isArray(expr.and)) {
      return expr.and.every((sub: any) => this.evaluateCondition(sub, context));
    }
    if (Array.isArray(expr.or)) {
      return expr.or.some((sub: any) => this.evaluateCondition(sub, context));
    }
    if (expr.not) {
      return !this.evaluateCondition(expr.not, context);
    }

    // Leaf node
    const { field, op, value } = expr;
    if (!field || !op) return true;

    const actual = this.resolveField(field, context);
    return this.applyOp(op, actual, value);
  }

  private resolveField(path: string, context: Record<string, any>): any {
    return path.split('.').reduce((obj: any, key) => obj?.[key], context);
  }

  private applyOp(op: string, actual: any, expected: any): boolean {
    switch (op) {
      case 'eq':         return actual === expected;
      case 'neq':        return actual !== expected;
      case 'gt':         return Number(actual) > Number(expected);
      case 'gte':        return Number(actual) >= Number(expected);
      case 'lt':         return Number(actual) < Number(expected);
      case 'lte':        return Number(actual) <= Number(expected);
      case 'in':         return Array.isArray(expected) && expected.includes(actual);
      case 'nin':        return Array.isArray(expected) && !expected.includes(actual);
      case 'contains':   return String(actual ?? '').includes(String(expected));
      case 'startsWith': return String(actual ?? '').startsWith(String(expected));
      case 'null':       return actual === null || actual === undefined;
      case 'notNull':    return actual !== null && actual !== undefined;
      default:           return true;
    }
  }

  private validateConditionExpression(expr: any): void {
    if (expr === null) return;
    if (typeof expr !== 'object') {
      throw new BadRequestException('conditionExpression must be a JSON object or null');
    }
    if (Array.isArray(expr.and) || Array.isArray(expr.or)) return;
    if (expr.not) return;
    if (!expr.field) throw new BadRequestException('Leaf condition must have "field"');
    if (!expr.op) throw new BadRequestException('Leaf condition must have "op"');
  }
}
