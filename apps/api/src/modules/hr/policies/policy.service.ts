import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HrPolicy, HrPolicyAcknowledgement, PolicyStatus } from './policy.entity';
import { AutomationService } from '../../automation/automation.service';

@Injectable()
export class PolicyService {
  constructor(
    @InjectRepository(HrPolicy) private readonly policyRepo: Repository<HrPolicy>,
    @InjectRepository(HrPolicyAcknowledgement) private readonly ackRepo: Repository<HrPolicyAcknowledgement>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  async create(
    tenantId: string, createdByUserId: string,
    dto: { title: string; category?: string; body: string; requiresAck?: boolean },
  ): Promise<HrPolicy> {
    if (!dto.title?.trim() || !dto.body?.trim()) throw new BadRequestException('title and body are required');
    return this.policyRepo.save(this.policyRepo.create({
      tenantId,
      title: dto.title.trim(),
      category: dto.category ?? 'general',
      body: dto.body,
      requiresAck: dto.requiresAck ?? true,
      version: 1,
      status: PolicyStatus.DRAFT,
      createdByUserId,
    }));
  }

  async list(tenantId: string, filters: { category?: string; status?: PolicyStatus } = {}): Promise<HrPolicy[]> {
    const where: any = { tenantId };
    if (filters.category) where.category = filters.category;
    if (filters.status) where.status = filters.status;
    return this.policyRepo.find({ where, order: { updatedAt: 'DESC' } });
  }

  async get(tenantId: string, id: string): Promise<HrPolicy> {
    const policy = await this.policyRepo.findOne({ where: { id, tenantId } });
    if (!policy) throw new NotFoundException(`Policy ${id} not found`);
    return policy;
  }

  /**
   * Update body/title. Editing a PUBLISHED policy mints a new version and
   * drops it back to DRAFT — prior acknowledgements are tied to the old
   * version, so re-publishing requires fresh sign-off.
   */
  async update(
    tenantId: string, id: string,
    dto: { title?: string; category?: string; body?: string; requiresAck?: boolean },
  ): Promise<HrPolicy> {
    const policy = await this.get(tenantId, id);
    const contentChanged = (dto.body != null && dto.body !== policy.body) || (dto.title != null && dto.title !== policy.title);
    if (policy.status === PolicyStatus.PUBLISHED && contentChanged) {
      policy.version += 1;
      policy.status = PolicyStatus.DRAFT;
      policy.publishedAt = null;
    }
    if (dto.title != null) policy.title = dto.title.trim();
    if (dto.category != null) policy.category = dto.category;
    if (dto.body != null) policy.body = dto.body;
    if (dto.requiresAck != null) policy.requiresAck = dto.requiresAck;
    return this.policyRepo.save(policy);
  }

  async publish(tenantId: string, id: string): Promise<HrPolicy> {
    const policy = await this.get(tenantId, id);
    if (policy.status === PolicyStatus.PUBLISHED) throw new BadRequestException('Policy is already published');
    policy.status = PolicyStatus.PUBLISHED;
    policy.publishedAt = new Date();
    const saved = await this.policyRepo.save(policy);
    await this.automation?.emit(tenantId, 'policy.published', {
      policyId: saved.id, title: saved.title, category: saved.category, version: saved.version, requiresAck: saved.requiresAck,
    });
    return saved;
  }

  async archive(tenantId: string, id: string): Promise<HrPolicy> {
    const policy = await this.get(tenantId, id);
    policy.status = PolicyStatus.ARCHIVED;
    return this.policyRepo.save(policy);
  }

  // ---- Acknowledgements ----
  async acknowledge(
    tenantId: string, id: string,
    employee: { employeeId: string; userId: string },
  ): Promise<HrPolicyAcknowledgement> {
    const policy = await this.get(tenantId, id);
    if (policy.status !== PolicyStatus.PUBLISHED) throw new BadRequestException('Only published policies can be acknowledged');
    if (!policy.requiresAck) throw new BadRequestException('This policy does not require acknowledgement');
    if (!employee.employeeId) throw new BadRequestException('employeeId is required to acknowledge');
    const existing = await this.ackRepo.findOne({
      where: { tenantId, policyId: id, version: policy.version, employeeId: employee.employeeId },
    });
    if (existing) return existing; // idempotent per version
    return this.ackRepo.save(this.ackRepo.create({
      tenantId, policyId: id, version: policy.version,
      employeeId: employee.employeeId, acknowledgedByUserId: employee.userId,
    }));
  }

  /** Whether an employee has acknowledged the current published version. */
  async acknowledgementStatus(tenantId: string, id: string, employeeId: string): Promise<{ version: number; acknowledged: boolean }> {
    const policy = await this.get(tenantId, id);
    const ack = await this.ackRepo.findOne({
      where: { tenantId, policyId: id, version: policy.version, employeeId },
    });
    return { version: policy.version, acknowledged: !!ack };
  }

  /** Acknowledgement roll-up for a policy version (compliance view). */
  async acknowledgements(tenantId: string, id: string): Promise<HrPolicyAcknowledgement[]> {
    const policy = await this.get(tenantId, id);
    return this.ackRepo.find({
      where: { tenantId, policyId: id, version: policy.version },
      order: { acknowledgedAt: 'DESC' },
    });
  }
}
