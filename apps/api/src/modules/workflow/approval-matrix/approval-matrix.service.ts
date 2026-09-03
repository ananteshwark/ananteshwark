import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalMatrixRule, ApproverChainEntry } from './approval-matrix.entity';
import { WorkflowDefinition, WorkflowStep } from '../entities/workflow-definition.entity';
import { WorkflowService } from '../workflow.service';
import { WorkflowInstance } from '../entities/workflow-instance.entity';

export interface StartForDocumentInput {
  docType: string;
  amount: number;
  orgUnitId?: string;
  subjectType: string;
  subjectId: string;
  context?: Record<string, any>;
}

/**
 * Amount-band × org-unit approval matrix on top of the workflow engine
 * (Fusion AMX / S4 flexible-workflow style). Each rule owns an
 * auto-generated workflow definition — one sequential approval step per
 * chain entry — so matrix approvals get the engine's authorization,
 * history, and escalation behavior for free.
 */
@Injectable()
export class ApprovalMatrixService {
  constructor(
    @InjectRepository(ApprovalMatrixRule)
    private readonly ruleRepo: Repository<ApprovalMatrixRule>,
    @InjectRepository(WorkflowDefinition)
    private readonly definitionRepo: Repository<WorkflowDefinition>,
    private readonly workflowService: WorkflowService,
  ) {}

  // ─── Rule administration ──────────────────────────────────────

  private validate(rule: Partial<ApprovalMatrixRule>): void {
    if (!rule.docType?.trim()) throw new BadRequestException('docType is required');
    if (!rule.approverChain?.length) throw new BadRequestException('At least one approver is required');
    for (const entry of rule.approverChain) {
      if (!['role', 'user', 'manager'].includes(entry.type) || !entry.value?.trim()) {
        throw new BadRequestException('Each approver needs a type (role/user/manager) and a value');
      }
    }
    const min = Number(rule.minAmount ?? 0);
    if (rule.maxAmount !== null && rule.maxAmount !== undefined && Number(rule.maxAmount) < min) {
      throw new BadRequestException('maxAmount cannot be below minAmount');
    }
  }

  private buildSteps(chain: ApproverChainEntry[]): WorkflowStep[] {
    return chain.map((entry, i) => ({
      id: `step-${i + 1}`,
      name: `Approval ${i + 1}: ${entry.type} ${entry.value}`,
      type: 'approval' as const,
      approvers: [entry],
      onApproveNext: i + 1 < chain.length ? `step-${i + 2}` : undefined,
    }));
  }

  /** Each rule keeps a generated definition in sync with its chain. */
  private async syncDefinition(rule: ApprovalMatrixRule): Promise<ApprovalMatrixRule> {
    const steps = this.buildSteps(rule.approverChain);
    let definition = rule.definitionId
      ? await this.definitionRepo.findOne({ where: { id: rule.definitionId, tenantId: rule.tenantId } })
      : null;
    if (!definition) {
      definition = this.definitionRepo.create({
        tenantId: rule.tenantId,
        triggerModule: 'approval-matrix',
        triggerEvent: rule.docType,
        isActive: true,
      });
    }
    definition.name = `[Matrix] ${rule.name}`;
    definition.steps = steps;
    definition.isActive = rule.isActive;
    const saved = await this.definitionRepo.save(definition);
    if (rule.definitionId !== saved.id) {
      rule.definitionId = saved.id;
      await this.ruleRepo.save(rule);
    }
    return rule;
  }

  async createRule(tenantId: string, dto: Partial<ApprovalMatrixRule>): Promise<ApprovalMatrixRule> {
    this.validate(dto);
    const rule = await this.ruleRepo.save(this.ruleRepo.create({
      ...dto,
      tenantId,
      minAmount: Number(dto.minAmount ?? 0),
      maxAmount: dto.maxAmount === undefined || dto.maxAmount === null ? null : Number(dto.maxAmount),
    }));
    return this.syncDefinition(rule);
  }

  async listRules(tenantId: string, docType?: string): Promise<ApprovalMatrixRule[]> {
    return this.ruleRepo.find({
      where: docType ? { tenantId, docType } : { tenantId },
      order: { docType: 'ASC', minAmount: 'ASC' },
    });
  }

  async updateRule(tenantId: string, id: string, dto: Partial<ApprovalMatrixRule>): Promise<ApprovalMatrixRule> {
    const rule = await this.ruleRepo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`Approval rule ${id} not found`);
    Object.assign(rule, dto, { id: rule.id, tenantId, definitionId: rule.definitionId });
    this.validate(rule);
    await this.ruleRepo.save(rule);
    return this.syncDefinition(rule);
  }

  async deleteRule(tenantId: string, id: string): Promise<void> {
    const rule = await this.ruleRepo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`Approval rule ${id} not found`);
    if (rule.definitionId) {
      // Retire rather than delete: running instances still reference it.
      const definition = await this.definitionRepo.findOne({ where: { id: rule.definitionId, tenantId } });
      if (definition) {
        definition.isActive = false;
        await this.definitionRepo.save(definition);
      }
    }
    await this.ruleRepo.delete({ id, tenantId });
  }

  // ─── Resolution & routing ─────────────────────────────────────

  /**
   * Pick the rule for a document. Specificity order:
   *  1. an org-unit-matched rule beats a generic (null org unit) rule;
   *  2. the narrower amount band wins (an unbounded band is widest);
   *  3. explicit priority breaks remaining ties.
   */
  async resolve(tenantId: string, docType: string, amount: number, orgUnitId?: string): Promise<ApprovalMatrixRule | null> {
    const rules = await this.ruleRepo.find({ where: { tenantId, docType, isActive: true } });
    const candidates = rules.filter((r) => {
      if (Number(amount) < Number(r.minAmount)) return false;
      if (r.maxAmount !== null && Number(amount) > Number(r.maxAmount)) return false;
      if (r.orgUnitId && r.orgUnitId !== orgUnitId) return false;
      return true;
    });
    if (!candidates.length) return null;
    const width = (r: ApprovalMatrixRule) =>
      r.maxAmount === null ? Number.POSITIVE_INFINITY : Number(r.maxAmount) - Number(r.minAmount);
    candidates.sort((a, b) => {
      const orgA = a.orgUnitId ? 0 : 1;
      const orgB = b.orgUnitId ? 0 : 1;
      if (orgA !== orgB) return orgA - orgB;
      if (width(a) !== width(b)) return width(a) - width(b);
      return b.priority - a.priority;
    });
    return candidates[0];
  }

  /** Route a document into the workflow engine via the matrix. */
  async startForDocument(tenantId: string, initiatorId: string, input: StartForDocumentInput): Promise<WorkflowInstance> {
    const rule = await this.resolve(tenantId, input.docType, input.amount, input.orgUnitId);
    if (!rule?.definitionId) {
      throw new NotFoundException(
        `No approval rule matches ${input.docType} for amount ${input.amount}` +
        (input.orgUnitId ? ` in org unit ${input.orgUnitId}` : ''),
      );
    }
    return this.workflowService.startWorkflow(tenantId, initiatorId, {
      definitionId: rule.definitionId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      context: { ...(input.context ?? {}), amount: input.amount, docType: input.docType, matrixRuleId: rule.id },
    } as any);
  }
}
