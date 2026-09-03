import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { ApprovalDelegation } from './entities/approval-delegation.entity';
import { CreateDelegationDto, UpdateDelegationDto } from './dto/delegation.dto';

export interface ListDelegationsFilter {
  delegatorUserId?: string;
  delegateeUserId?: string;
  active?: boolean;
}

@Injectable()
export class DelegationService {
  constructor(
    @InjectRepository(ApprovalDelegation)
    private readonly delegationRepository: Repository<ApprovalDelegation>,
  ) {}

  private toDateString(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  async create(
    tenantId: string,
    currentUserId: string,
    dto: CreateDelegationDto,
  ): Promise<ApprovalDelegation> {
    const delegation = this.delegationRepository.create({
      tenantId,
      delegatorUserId: dto.delegatorUserId || currentUserId,
      delegateeUserId: dto.delegateeUserId,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      scope: dto.scope || 'ALL',
      reason: dto.reason ?? null,
      isActive: true,
    });
    return this.delegationRepository.save(delegation);
  }

  async list(
    tenantId: string,
    filter: ListDelegationsFilter = {},
  ): Promise<ApprovalDelegation[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filter.delegatorUserId) where.delegatorUserId = filter.delegatorUserId;
    if (filter.delegateeUserId) where.delegateeUserId = filter.delegateeUserId;
    if (filter.active !== undefined) where.isActive = filter.active;
    return this.delegationRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string, tenantId: string): Promise<ApprovalDelegation> {
    const delegation = await this.delegationRepository.findOne({ where: { id, tenantId } });
    if (!delegation) throw new NotFoundException('Delegation not found');
    return delegation;
  }

  async update(
    id: string,
    tenantId: string,
    dto: UpdateDelegationDto,
  ): Promise<ApprovalDelegation> {
    const delegation = await this.findById(id, tenantId);
    Object.assign(delegation, {
      ...dto,
      reason: dto.reason !== undefined ? dto.reason : delegation.reason,
    });
    return this.delegationRepository.save(delegation);
  }

  async revoke(id: string, tenantId: string): Promise<ApprovalDelegation> {
    const delegation = await this.findById(id, tenantId);
    delegation.isActive = false;
    return this.delegationRepository.save(delegation);
  }

  /**
   * Resolve the effective approver for a given approver.
   *
   * If an active delegation covers the given date and scope, the delegatee is
   * returned. Chained delegation is followed shallowly (one extra hop) and
   * guarded against loops so callers always get a concrete approver back.
   */
  async resolveDelegate(
    tenantId: string,
    approverUserId: string,
    scope = 'ALL',
    onDate?: Date,
  ): Promise<string> {
    const dateStr = this.toDateString(onDate ?? new Date());
    const visited = new Set<string>([approverUserId]);
    let current = approverUserId;

    // Follow at most two hops (initial + one chained delegation).
    for (let hop = 0; hop < 2; hop++) {
      const delegation = await this.findCoveringDelegation(
        tenantId,
        current,
        scope,
        dateStr,
      );
      if (!delegation) break;
      const next = delegation.delegateeUserId;
      if (visited.has(next)) break; // loop guard
      visited.add(next);
      current = next;
    }

    return current;
  }

  private async findCoveringDelegation(
    tenantId: string,
    delegatorUserId: string,
    scope: string,
    dateStr: string,
  ): Promise<ApprovalDelegation | null> {
    const candidates = await this.delegationRepository.find({
      where: {
        tenantId,
        delegatorUserId,
        isActive: true,
        fromDate: LessThanOrEqual(dateStr),
        toDate: MoreThanOrEqual(dateStr),
      },
      order: { createdAt: 'DESC' },
    });

    // Prefer a scope-specific match, fall back to an ALL delegation.
    const exact = candidates.find(
      (d) => d.scope === scope || d.scope === 'ALL',
    );
    return exact ?? null;
  }

  /**
   * Active in-range delegations where the user is either the delegator
   * (outbound) or the delegatee (inbound). Used for the "active delegation"
   * indicator in the UI.
   */
  async getActiveForUser(
    tenantId: string,
    userId: string,
  ): Promise<{ outbound: ApprovalDelegation[]; inbound: ApprovalDelegation[] }> {
    const dateStr = this.toDateString(new Date());
    const range = {
      tenantId,
      isActive: true,
      fromDate: LessThanOrEqual(dateStr),
      toDate: MoreThanOrEqual(dateStr),
    };
    const [outbound, inbound] = await Promise.all([
      this.delegationRepository.find({
        where: { ...range, delegatorUserId: userId },
        order: { createdAt: 'DESC' },
      }),
      this.delegationRepository.find({
        where: { ...range, delegateeUserId: userId },
        order: { createdAt: 'DESC' },
      }),
    ]);
    return { outbound, inbound };
  }
}
