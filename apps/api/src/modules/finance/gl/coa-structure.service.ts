import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CoaSegment, CoaSegmentValue } from './entities/coa-segment.entity';
import { AccountTree, AccountTreeNode } from './entities/account-tree.entity';
import { CrossValidationRule, SegmentOperator } from './entities/cross-validation-rule.entity';
import { Account } from './entities/account.entity';

export interface CrossValidationViolation {
  ruleId: string;
  ruleName: string;
  accountCode: string;
  message: string;
}

@Injectable()
export class CoaStructureService {
  constructor(
    @InjectRepository(CoaSegment) private readonly segmentRepo: Repository<CoaSegment>,
    @InjectRepository(CoaSegmentValue) private readonly segValueRepo: Repository<CoaSegmentValue>,
    @InjectRepository(AccountTree) private readonly treeRepo: Repository<AccountTree>,
    @InjectRepository(AccountTreeNode) private readonly nodeRepo: Repository<AccountTreeNode>,
    @InjectRepository(CrossValidationRule) private readonly cvrRepo: Repository<CrossValidationRule>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
  ) {}

  // ─── Ph-96: Segments ──────────────────────────────────────────────

  async listSegments(tenantId: string): Promise<CoaSegment[]> {
    return this.segmentRepo.find({ where: { tenantId }, order: { position: 'ASC' } });
  }

  async createSegment(tenantId: string, data: {
    position: number; code: string; label: string;
    length?: number; isRequired?: boolean; delimiter?: string;
  }): Promise<CoaSegment> {
    if (!data.position || data.position < 1 || data.position > 6) {
      throw new BadRequestException('Segment position must be between 1 and 6');
    }
    const existing = await this.segmentRepo.findOne({ where: { tenantId, position: data.position } });
    if (existing) throw new BadRequestException(`Segment position ${data.position} already defined`);
    const seg = this.segmentRepo.create({
      tenantId,
      position: data.position,
      code: data.code,
      label: data.label,
      length: data.length ?? 4,
      isRequired: data.isRequired !== false,
      delimiter: data.delimiter ?? '-',
      isActive: true,
    } as any) as unknown as CoaSegment;
    return (this.segmentRepo.save(seg) as unknown) as Promise<CoaSegment>;
  }

  async updateSegment(tenantId: string, id: string, data: Partial<CoaSegment>): Promise<CoaSegment> {
    const seg = await this.segmentRepo.findOne({ where: { id, tenantId } });
    if (!seg) throw new NotFoundException(`Segment ${id} not found`);
    Object.assign(seg, data);
    return (this.segmentRepo.save(seg) as unknown) as Promise<CoaSegment>;
  }

  async deleteSegment(tenantId: string, id: string): Promise<void> {
    const seg = await this.segmentRepo.findOne({ where: { id, tenantId } });
    if (!seg) throw new NotFoundException(`Segment ${id} not found`);
    await this.segValueRepo.delete({ tenantId, segmentId: id });
    await this.segmentRepo.remove(seg);
  }

  async listSegmentValues(tenantId: string, segmentId: string): Promise<CoaSegmentValue[]> {
    return this.segValueRepo.find({ where: { tenantId, segmentId }, order: { value: 'ASC' } });
  }

  async createSegmentValue(tenantId: string, data: {
    segmentId: string; value: string; description: string; parentValue?: string;
  }): Promise<CoaSegmentValue> {
    const seg = await this.segmentRepo.findOne({ where: { id: data.segmentId, tenantId } });
    if (!seg) throw new NotFoundException(`Segment ${data.segmentId} not found`);
    const sv = this.segValueRepo.create({
      tenantId,
      segmentId: data.segmentId,
      value: data.value,
      description: data.description,
      parentValue: data.parentValue ?? null,
      isActive: true,
    } as any) as unknown as CoaSegmentValue;
    return (this.segValueRepo.save(sv) as unknown) as Promise<CoaSegmentValue>;
  }

  async deleteSegmentValue(tenantId: string, id: string): Promise<void> {
    const sv = await this.segValueRepo.findOne({ where: { id, tenantId } });
    if (!sv) throw new NotFoundException(`Segment value ${id} not found`);
    await this.segValueRepo.remove(sv);
  }

  /**
   * Split a delimited account code into its segment values, ordered by position.
   * Uses the delimiter from the first segment definition (default '-').
   */
  async parseAccountCode(tenantId: string, code: string): Promise<Record<number, string>> {
    const segments = await this.listSegments(tenantId);
    const delimiter = segments[0]?.delimiter ?? '-';
    const parts = code.split(delimiter);
    const result: Record<number, string> = {};
    parts.forEach((part, idx) => {
      result[idx + 1] = part;
    });
    return result;
  }

  /**
   * Validate a composed account code against segment definitions and value sets.
   * Returns a list of error strings (empty = valid).
   */
  async validateAccountCode(tenantId: string, code: string): Promise<string[]> {
    const segments = await this.listSegments(tenantId);
    if (segments.length === 0) return []; // no structure configured → flat codes allowed
    const delimiter = segments[0].delimiter ?? '-';
    const parts = code.split(delimiter);
    const errors: string[] = [];

    const activeSegs = segments.filter((s) => s.isActive).sort((a, b) => a.position - b.position);
    for (const seg of activeSegs) {
      const part = parts[seg.position - 1];
      if (!part) {
        if (seg.isRequired) errors.push(`Segment ${seg.position} (${seg.label}) is required`);
        continue;
      }
      const allowed = await this.segValueRepo.find({ where: { tenantId, segmentId: seg.id, isActive: true } });
      if (allowed.length > 0 && !allowed.some((v) => v.value === part)) {
        errors.push(`Segment ${seg.position} (${seg.label}): "${part}" is not a valid value`);
      }
    }
    return errors;
  }

  // ─── Ph-97: Trees ─────────────────────────────────────────────────

  async listTrees(tenantId: string): Promise<AccountTree[]> {
    return this.treeRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async createTree(tenantId: string, data: {
    code: string; name: string; description?: string; version?: string;
  }): Promise<AccountTree> {
    const existing = await this.treeRepo.findOne({ where: { tenantId, code: data.code } });
    if (existing) throw new BadRequestException(`Tree code ${data.code} already exists`);
    const tree = this.treeRepo.create({
      tenantId,
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      version: data.version ?? 'v1',
      isActive: true,
    } as any) as unknown as AccountTree;
    return (this.treeRepo.save(tree) as unknown) as Promise<AccountTree>;
  }

  async deleteTree(tenantId: string, id: string): Promise<void> {
    const tree = await this.treeRepo.findOne({ where: { id, tenantId } });
    if (!tree) throw new NotFoundException(`Tree ${id} not found`);
    await this.nodeRepo.delete({ tenantId, treeId: id });
    await this.treeRepo.remove(tree);
  }

  async addNode(tenantId: string, treeId: string, data: {
    parentNodeId?: string; label: string; accountId?: string; sortOrder?: number;
  }): Promise<AccountTreeNode> {
    const tree = await this.treeRepo.findOne({ where: { id: treeId, tenantId } });
    if (!tree) throw new NotFoundException(`Tree ${treeId} not found`);
    if (data.parentNodeId) {
      const parent = await this.nodeRepo.findOne({ where: { id: data.parentNodeId, tenantId, treeId } });
      if (!parent) throw new BadRequestException('Parent node not found in this tree');
    }
    if (data.accountId) {
      const acc = await this.accountRepo.findOne({ where: { id: data.accountId, tenantId } });
      if (!acc) throw new BadRequestException('Account not found');
    }
    const node = this.nodeRepo.create({
      tenantId,
      treeId,
      parentNodeId: data.parentNodeId ?? null,
      label: data.label,
      accountId: data.accountId ?? null,
      sortOrder: data.sortOrder ?? 0,
    } as any) as unknown as AccountTreeNode;
    return (this.nodeRepo.save(node) as unknown) as Promise<AccountTreeNode>;
  }

  async deleteNode(tenantId: string, id: string): Promise<void> {
    const node = await this.nodeRepo.findOne({ where: { id, tenantId } });
    if (!node) throw new NotFoundException(`Node ${id} not found`);
    // re-parent children to this node's parent to avoid orphans
    await this.nodeRepo.update(
      { tenantId, parentNodeId: id },
      { parentNodeId: node.parentNodeId },
    );
    await this.nodeRepo.remove(node);
  }

  /** Return the tree as a nested structure of root nodes with children. */
  async getTreeStructure(tenantId: string, treeId: string): Promise<any> {
    const tree = await this.treeRepo.findOne({ where: { id: treeId, tenantId } });
    if (!tree) throw new NotFoundException(`Tree ${treeId} not found`);
    const nodes = await this.nodeRepo.find({ where: { tenantId, treeId }, order: { sortOrder: 'ASC' } });

    const byParent = new Map<string | null, AccountTreeNode[]>();
    for (const n of nodes) {
      const key = n.parentNodeId ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(n);
    }
    const build = (parentId: string | null): any[] =>
      (byParent.get(parentId) ?? []).map((n) => ({
        id: n.id,
        label: n.label,
        accountId: n.accountId,
        isLeaf: !!n.accountId,
        children: build(n.id),
      }));

    return { tree, roots: build(null) };
  }

  // ─── Ph-98: Cross-Validation Rules ────────────────────────────────

  async listCrossValidationRules(tenantId: string): Promise<CrossValidationRule[]> {
    return this.cvrRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async createCrossValidationRule(tenantId: string, data: {
    name: string; description?: string;
    conditionPosition: number; conditionOperator: SegmentOperator; conditionValue: any;
    targetPosition: number; targetOperator: SegmentOperator; targetValue: any;
    errorMessage?: string; isActive?: boolean;
  }): Promise<CrossValidationRule> {
    const rule = this.cvrRepo.create({
      tenantId,
      name: data.name,
      description: data.description ?? null,
      conditionPosition: data.conditionPosition,
      conditionOperator: data.conditionOperator,
      conditionValue: data.conditionValue,
      targetPosition: data.targetPosition,
      targetOperator: data.targetOperator,
      targetValue: data.targetValue,
      errorMessage: data.errorMessage ?? null,
      isActive: data.isActive !== false,
    } as any) as unknown as CrossValidationRule;
    return (this.cvrRepo.save(rule) as unknown) as Promise<CrossValidationRule>;
  }

  async deleteCrossValidationRule(tenantId: string, id: string): Promise<void> {
    const rule = await this.cvrRepo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`Rule ${id} not found`);
    await this.cvrRepo.remove(rule);
  }

  /** Evaluate one segment leg against an operator + value. */
  matchSegment(op: SegmentOperator, actual: string | undefined, expected: any): boolean {
    if (actual === undefined || actual === null) return false;
    switch (op) {
      case SegmentOperator.EQ:
        return actual === String(expected);
      case SegmentOperator.IN:
        return Array.isArray(expected) && expected.map(String).includes(actual);
      case SegmentOperator.STARTS_WITH:
        return actual.startsWith(String(expected));
      case SegmentOperator.RANGE:
        return (
          expected &&
          actual >= String(expected.from) &&
          actual <= String(expected.to)
        );
      default:
        return false;
    }
  }

  /**
   * Validate a single account code against all active cross-validation rules.
   * A rule fires (= violation) when BOTH the condition leg and the target leg match.
   */
  async validateCombination(tenantId: string, code: string): Promise<CrossValidationViolation[]> {
    const rules = await this.cvrRepo.find({ where: { tenantId, isActive: true } });
    if (rules.length === 0) return [];
    const segMap = await this.parseAccountCode(tenantId, code);
    const violations: CrossValidationViolation[] = [];
    for (const rule of rules) {
      const condMatch = this.matchSegment(
        rule.conditionOperator, segMap[rule.conditionPosition], rule.conditionValue,
      );
      const targetMatch = this.matchSegment(
        rule.targetOperator, segMap[rule.targetPosition], rule.targetValue,
      );
      if (condMatch && targetMatch) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          accountCode: code,
          message: rule.errorMessage ?? `Account ${code} violates cross-validation rule "${rule.name}"`,
        });
      }
    }
    return violations;
  }

  /**
   * Validate a set of account IDs (as used on JE lines) against cross-validation
   * rules. Loads each account's code, parses, and checks. Throws on any violation.
   * No-op when no rules or no segment structure are configured.
   */
  async assertAccountsValid(tenantId: string, accountIds: string[]): Promise<void> {
    const ruleCount = await this.cvrRepo.count({ where: { tenantId, isActive: true } });
    if (ruleCount === 0) return;
    const uniqueIds = [...new Set(accountIds)];
    const accounts = await this.accountRepo.find({ where: { id: In(uniqueIds), tenantId } });
    const allViolations: CrossValidationViolation[] = [];
    for (const acc of accounts) {
      const v = await this.validateCombination(tenantId, acc.code);
      allViolations.push(...v);
    }
    if (allViolations.length > 0) {
      throw new BadRequestException(allViolations.map((v) => v.message).join('; '));
    }
  }
}
