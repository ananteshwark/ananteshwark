import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantStatus } from './entities/tenant.entity';
import { CreateTenantDto, UpdateTenantSettingsDto } from './dto/create-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

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
    tenant.settings = { ...tenant.settings, ...dto };
    return this.tenantRepository.save(tenant);
  }
}
