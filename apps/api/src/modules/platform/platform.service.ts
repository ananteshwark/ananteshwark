import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SsoProvider } from './entities/sso-provider.entity';
import { SodRule } from './entities/sod-rule.entity';
import { SodViolation, ViolationStatus } from './entities/sod-violation.entity';
import { TaxCode } from './entities/tax-code.entity';
import { DataRetentionPolicy } from './entities/data-retention-policy.entity';
import { CreateSsoProviderDto, CreateSodRuleDto, CreateTaxCodeDto, ComputeTaxDto, CreateRetentionPolicyDto } from './dto/platform.dto';

@Injectable()
export class PlatformService {
  constructor(
    @InjectRepository(SsoProvider) private readonly ssoRepo: Repository<SsoProvider>,
    @InjectRepository(SodRule) private readonly sodRuleRepo: Repository<SodRule>,
    @InjectRepository(SodViolation) private readonly violationRepo: Repository<SodViolation>,
    @InjectRepository(TaxCode) private readonly taxRepo: Repository<TaxCode>,
    @InjectRepository(DataRetentionPolicy) private readonly retentionRepo: Repository<DataRetentionPolicy>,
  ) {}

  // ---- SSO Providers ----
  async createSsoProvider(tenantId: string, dto: CreateSsoProviderDto): Promise<SsoProvider> {
    return this.ssoRepo.save(this.ssoRepo.create({ ...dto, tenantId }));
  }

  async listSsoProviders(tenantId: string): Promise<SsoProvider[]> {
    return this.ssoRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async toggleSsoProvider(tenantId: string, id: string): Promise<SsoProvider> {
    const provider = await this.ssoRepo.findOne({ where: { tenantId, id } });
    if (!provider) throw new NotFoundException(`SSO provider ${id} not found`);
    provider.isActive = !provider.isActive;
    return this.ssoRepo.save(provider);
  }

  // ---- SoD Rules ----
  async createSodRule(tenantId: string, dto: CreateSodRuleDto): Promise<SodRule> {
    return this.sodRuleRepo.save(this.sodRuleRepo.create({ ...dto, tenantId }));
  }

  async listSodRules(tenantId: string): Promise<SodRule[]> {
    return this.sodRuleRepo.find({ where: { tenantId, isActive: true }, order: { riskLevel: 'DESC' } });
  }

  async runSodCheck(tenantId: string, userId: string, userPermissions: string[]): Promise<SodViolation[]> {
    const rules = await this.listSodRules(tenantId);
    const violations: SodViolation[] = [];

    for (const rule of rules) {
      const hasA = userPermissions.includes(rule.permissionA);
      const hasB = userPermissions.includes(rule.permissionB);
      if (hasA && hasB) {
        const existing = await this.violationRepo.findOne({ where: { tenantId, ruleId: rule.id, userId, status: ViolationStatus.OPEN } });
        if (!existing) {
          const violation = await this.violationRepo.save(this.violationRepo.create({ tenantId, ruleId: rule.id, userId }));
          violations.push(violation);
        }
      }
    }
    return violations;
  }

  async listViolations(tenantId: string): Promise<SodViolation[]> {
    return this.violationRepo.find({ where: { tenantId }, order: { detectedAt: 'DESC' } });
  }

  async mitigateViolation(tenantId: string, id: string, notes: string): Promise<SodViolation> {
    const violation = await this.violationRepo.findOne({ where: { tenantId, id } });
    if (!violation) throw new NotFoundException(`Violation ${id} not found`);
    violation.status = ViolationStatus.MITIGATED;
    violation.notes = notes;
    return this.violationRepo.save(violation);
  }

  // ---- Tax Engine ----
  async createTaxCode(tenantId: string, dto: CreateTaxCodeDto): Promise<TaxCode> {
    return this.taxRepo.save(this.taxRepo.create({ ...dto, tenantId }));
  }

  async listTaxCodes(tenantId: string): Promise<TaxCode[]> {
    return this.taxRepo.find({ where: { tenantId, isActive: true }, order: { code: 'ASC' } });
  }

  async computeTax(tenantId: string, dto: ComputeTaxDto): Promise<{ taxCode: string; rate: number; baseAmount: number; taxAmount: number; total: number }> {
    const today = new Date().toISOString().slice(0, 10);
    const code = await this.taxRepo.findOne({ where: { tenantId, code: dto.taxCode, isActive: true } });
    if (!code) throw new NotFoundException(`Tax code ${dto.taxCode} not found`);
    if (code.effectiveTo && code.effectiveTo < today) throw new BadRequestException('Tax code is expired');
    const taxAmount = Math.round(dto.amount * code.rate / 100 * 100) / 100;
    return { taxCode: dto.taxCode, rate: code.rate, baseAmount: dto.amount, taxAmount, total: dto.amount + taxAmount };
  }

  // ---- Data Retention ----
  async createRetentionPolicy(tenantId: string, dto: CreateRetentionPolicyDto): Promise<DataRetentionPolicy> {
    return this.retentionRepo.save(this.retentionRepo.create({ ...dto, tenantId }));
  }

  async listRetentionPolicies(tenantId: string): Promise<DataRetentionPolicy[]> {
    return this.retentionRepo.find({ where: { tenantId }, order: { entityName: 'ASC' } });
  }
}
