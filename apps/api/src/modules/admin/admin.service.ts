import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Tenant, TenantStatus } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import { TenantLicense, TenantLicenseStatus } from './entities/tenant-license.entity';
import { CreateTenantDto, UpdateTenantDto, AllocateLicenseDto, UpdateLicenseDto } from './dto/admin.dto';
import { UsersService } from '../users/users.service';
import { RbacService } from '../rbac/rbac.service';
import { PermissionsService } from '../rbac/permissions.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(TenantLicense)
    private readonly licenseRepo: Repository<TenantLicense>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    private readonly usersService: UsersService,
    private readonly rbacService: RbacService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // Trimmed view of a Tenant Admin user, safe to return to the super-admin UI
  // (no password hashes / secrets — those carry @Exclude but we project explicitly).
  private toAdminSummary(u: User) {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      fullName: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
      phone: u.phone ?? null,
      status: u.status,
      lastLoginAt: u.lastLoginAt ?? null,
    };
  }

  // Resolve the Tenant Admin user(s) for each tenant by joining role assignments
  // to the "Tenant Admin" system role. Returns a map tenantId -> admin summaries.
  private async resolveTenantAdmins(tenantIds: string[]): Promise<Map<string, any[]>> {
    const byTenant = new Map<string, any[]>();
    if (tenantIds.length === 0) return byTenant;
    const rows = await this.userRoleRepo
      .createQueryBuilder('ur')
      .innerJoinAndSelect('ur.role', 'role')
      .innerJoinAndSelect('ur.user', 'user')
      .where('ur.tenantId IN (:...ids)', { ids: tenantIds })
      .andWhere('role.name = :name', { name: 'Tenant Admin' })
      .getMany();
    const seen = new Set<string>();
    for (const r of rows) {
      if (!r.user) continue;
      const key = `${r.tenantId}:${r.userId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const list = byTenant.get(r.tenantId) ?? [];
      list.push(this.toAdminSummary(r.user));
      byTenant.set(r.tenantId, list);
    }
    return byTenant;
  }

  // ---- Tenants (cross-tenant; super admin only) ----
  async listTenants(): Promise<any[]> {
    const tenants = await this.tenantRepo.find({ order: { createdAt: 'DESC' } });
    if (tenants.length === 0) return [];
    const ids = tenants.map(t => t.id);
    const [licenses, users, adminsByTenant] = await Promise.all([
      this.licenseRepo.find({ where: { tenantId: In(ids) } }),
      this.userRepo.find({ where: { tenantId: In(ids) } }),
      this.resolveTenantAdmins(ids),
    ]);
    const licByTenant = new Map(licenses.map(l => [l.tenantId, l]));
    const userCount = new Map<string, number>();
    users.forEach(u => userCount.set(u.tenantId, (userCount.get(u.tenantId) ?? 0) + 1));
    return tenants.map(t => {
      const admins = adminsByTenant.get(t.id) ?? [];
      return {
        ...t,
        license: licByTenant.get(t.id) ?? null,
        userCount: userCount.get(t.id) ?? 0,
        admins,
        primaryAdmin: admins[0] ?? null,
      };
    });
  }

  async getTenant(id: string): Promise<any> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    const license = await this.licenseRepo.findOne({ where: { tenantId: id } });
    const userCount = await this.userRepo.count({ where: { tenantId: id } });
    const admins = (await this.resolveTenantAdmins([id])).get(id) ?? [];
    return { ...tenant, license: license ?? null, userCount, admins, primaryAdmin: admins[0] ?? null };
  }

  async createTenant(dto: CreateTenantDto): Promise<any> {
    const existing = await this.tenantRepo.findOne({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Tenant slug ${dto.slug} already exists`);

    // Login resolves the tenant by email, so the admin email must be globally unique.
    const emailTaken = await this.userRepo.findOne({ where: { email: dto.adminEmail.toLowerCase() } });
    if (emailTaken) throw new ConflictException(`Email ${dto.adminEmail} is already in use`);

    const tenant = await this.tenantRepo.save(
      this.tenantRepo.create({ name: dto.name, slug: dto.slug, plan: dto.plan, settings: {} }),
    );

    // Provision system roles and the default tenant admin for the new tenant.
    await this.rbacService.seedSystemRoles(tenant.id);
    const adminUser = await this.usersService.create(tenant.id, {
      email: dto.adminEmail,
      firstName: dto.adminFirstName,
      lastName: dto.adminLastName,
      password: dto.adminPassword,
    } as any);
    const roles = await this.rbacService.findAll(tenant.id);
    const adminRole = roles.find((r) => r.name === 'Tenant Admin');
    if (adminRole) {
      await this.permissionsService.assignRole(adminUser.id, adminRole.id, tenant.id, adminUser.id);
    }

    return { ...tenant, adminUser: { id: adminUser.id, email: adminUser.email } };
  }

  async updateTenant(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    Object.assign(tenant, dto);
    return this.tenantRepo.save(tenant);
  }

  async setTenantStatus(id: string, status: TenantStatus): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    tenant.status = status;
    return this.tenantRepo.save(tenant);
  }

  // ---- License allocation ----
  async allocateLicense(tenantId: string, dto: AllocateLicenseDto): Promise<TenantLicense> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    let license = await this.licenseRepo.findOne({ where: { tenantId } });
    if (license) {
      Object.assign(license, dto);
    } else {
      license = this.licenseRepo.create({
        tenantId,
        status: TenantLicenseStatus.ACTIVE,
        enabledModules: [],
        ...dto,
      });
    }
    const saved = await this.licenseRepo.save(license);

    // Keep tenant.settings.enabledModules in sync so module gating reflects the
    // allocation immediately.
    if (dto.enabledModules) {
      tenant.settings = { ...(tenant.settings ?? {}), enabledModules: dto.enabledModules };
      await this.tenantRepo.save(tenant);
    }
    return saved;
  }

  async updateLicense(tenantId: string, dto: UpdateLicenseDto): Promise<TenantLicense> {
    const license = await this.licenseRepo.findOne({ where: { tenantId } });
    if (!license) throw new NotFoundException(`No license allocated to tenant ${tenantId}`);
    Object.assign(license, dto);
    const saved = await this.licenseRepo.save(license);
    if (dto.enabledModules) {
      const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
      if (tenant) {
        tenant.settings = { ...(tenant.settings ?? {}), enabledModules: dto.enabledModules };
        await this.tenantRepo.save(tenant);
      }
    }
    return saved;
  }

  async revokeLicense(tenantId: string): Promise<TenantLicense> {
    const license = await this.licenseRepo.findOne({ where: { tenantId } });
    if (!license) throw new NotFoundException(`No license allocated to tenant ${tenantId}`);
    license.status = TenantLicenseStatus.SUSPENDED;
    return this.licenseRepo.save(license);
  }
}
