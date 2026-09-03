import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DelegationAuthority } from './entities/delegation-authority.entity';
import { CreateDoaRuleDto, UpdateDoaRuleDto } from './dto/doa.dto';

@Injectable()
export class DoaService {
  constructor(
    @InjectRepository(DelegationAuthority)
    private readonly repo: Repository<DelegationAuthority>,
  ) {}

  async listRules(tenantId: string, documentType?: string): Promise<DelegationAuthority[]> {
    const where: any = { tenantId };
    if (documentType) where.documentType = documentType;
    return this.repo.find({
      where,
      order: { level: 'ASC', amountFrom: 'ASC' },
    });
  }

  async createRule(tenantId: string, dto: CreateDoaRuleDto): Promise<DelegationAuthority> {
    const rule = this.repo.create({
      tenantId,
      documentType: dto.documentType,
      level: dto.level,
      amountFrom: dto.amountFrom ?? 0,
      amountTo: dto.amountTo ?? null,
      approverUserId: dto.approverUserId ?? null,
      approverRole: dto.approverRole,
      approverName: dto.approverName,
      isActive: dto.isActive ?? true,
    });
    return this.repo.save(rule);
  }

  async updateRule(tenantId: string, id: string, dto: UpdateDoaRuleDto): Promise<DelegationAuthority> {
    const rule = await this.repo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`DoA rule ${id} not found`);
    Object.assign(rule, dto);
    return this.repo.save(rule);
  }

  async deleteRule(tenantId: string, id: string): Promise<{ message: string }> {
    const rule = await this.repo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`DoA rule ${id} not found`);
    rule.isActive = false;
    await this.repo.save(rule);
    return { message: 'Rule deactivated' };
  }

  async getRequiredApprovers(
    tenantId: string,
    documentType: string,
    amount: number,
  ): Promise<DelegationAuthority[]> {
    const rules = await this.repo.find({
      where: { tenantId, documentType, isActive: true },
      order: { level: 'ASC' },
    });

    // Return all rules that apply to this amount range
    return rules.filter((rule) => {
      if (amount < rule.amountFrom) return false;
      if (rule.amountTo !== null && amount > rule.amountTo) return false;
      return true;
    });
  }
}
