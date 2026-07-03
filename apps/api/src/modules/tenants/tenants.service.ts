import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantStatus } from './entities/tenant.entity';
import { TenantLicense } from '../admin/entities/tenant-license.entity';
import { CreateTenantDto, UpdateTenantSettingsDto } from './dto/create-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantLicense)
    private readonly licenseRepository: Repository<TenantLicense>,
  ) {}

  // The modules a tenant is allowed to run are exactly the ones the platform
  // (super admin) granted on its license. A tenant admin can never enable a
  // module beyond this set. With no license allocated, nothing is assigned yet.
  async getLicensedModules(tenantId: string): Promise<string[]> {
    const license = await this.licenseRepository.findOne({ where: { tenantId } });
    return license?.enabledModules ?? [];
  }

  async create(dto: CreateTenantDto): Promise<Tenant> {
    const existing = await this.tenantRepository.findOne({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Tenant with slug '${dto.slug}' already exists`);

    const tenant = this.tenantRepository.create({
      ...dto,
      settings: {
        enabledModules: ['hr', 'finance', 'payroll'],
        locale: 'en',
        timezone: 'UTC',
        baseCurrency: 'USD',
        fiscalYearStart: 1,
      },
    });
    return this.tenantRepository.save(tenant);
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async findBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { slug } });
    if (!tenant) throw new NotFoundException(`Tenant with slug '${slug}' not found`);
    return tenant;
  }

  async findAll(): Promise<Tenant[]> {
    return this.tenantRepository.find();
  }

  async update(id: string, updates: Partial<Tenant>): Promise<Tenant> {
    const tenant = await this.findById(id);
    Object.assign(tenant, updates);
    return this.tenantRepository.save(tenant);
  }

  async suspend(id: string): Promise<Tenant> {
    return this.update(id, { status: TenantStatus.SUSPENDED });
  }

  async getSettings(id: string) {
    const tenant = await this.findById(id);
    return tenant.settings;
  }

  async updateSettings(id: string, dto: UpdateTenantSettingsDto): Promise<Tenant> {
    const tenant = await this.findById(id);
    // Guard the module set against the super admin's license: a tenant may only
    // enable modules it has been assigned, never grant itself more.
    if (dto.enabledModules) {
      const licensed = await this.getLicensedModules(id);
      const unlicensed = dto.enabledModules.filter((m) => !licensed.includes(m));
      if (unlicensed.length > 0) {
        throw new BadRequestException(
          `These modules are not included in your license: ${unlicensed.join(', ')}. ` +
            `Contact your platform administrator to update your plan.`,
        );
      }
    }
    tenant.settings = { ...tenant.settings, ...dto };
    return this.tenantRepository.save(tenant);
  }
}
