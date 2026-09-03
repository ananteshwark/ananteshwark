import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { CreateRoleDto, UpdateRoleDto } from './dto/rbac.dto';
import { SYSTEM_ROLES } from './permissions.service';

@Injectable()
export class RbacService implements OnModuleInit {
  private readonly logger = new Logger(RbacService.name);

  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  /**
   * On boot, re-sync every existing tenant's system-role permissions so that
   * permission strings newly added to ALL_PERMISSIONS take effect for tenants
   * that were provisioned before the deploy (seedSystemRoles otherwise only
   * runs at tenant-creation time).
   */
  async onModuleInit(): Promise<void> {
    try {
      const rows = await this.roleRepository
        .createQueryBuilder('role')
        .select('DISTINCT role.tenantId', 'tenantId')
        .where('role.isSystemRole = true')
        .getRawMany();
      for (const { tenantId } of rows) {
        if (tenantId) await this.seedSystemRoles(tenantId);
      }
      if (rows.length) {
        this.logger.log(`Re-synced system-role permissions for ${rows.length} tenant(s).`);
      }
    } catch (err) {
      // Non-fatal: DB may not be ready or migrations still applying.
      this.logger.warn(`System-role re-sync skipped: ${(err as Error).message}`);
    }
  }

  async createRole(tenantId: string, dto: CreateRoleDto): Promise<Role> {
    const role = this.roleRepository.create({ ...dto, tenantId, permissions: dto.permissions || [] });
    return this.roleRepository.save(role);
  }

  async findAll(tenantId: string): Promise<Role[]> {
    // Each tenant is seeded its own copy of the system roles (tagged with its
    // tenantId), so filtering by tenantId returns both custom and system roles
    // for the caller — without leaking other tenants' rows.
    return this.roleRepository
      .createQueryBuilder('role')
      .where('role.tenantId = :tenantId', { tenantId })
      .orderBy('role.name', 'ASC')
      .getMany();
  }

  async findById(id: string, tenantId: string): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { id, tenantId } });
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    return role;
  }

  async update(id: string, tenantId: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.findById(id, tenantId);
    if (role.isSystemRole) {
      throw new BadRequestException('System roles cannot be modified');
    }
    Object.assign(role, dto);
    return this.roleRepository.save(role);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const role = await this.findById(id, tenantId);
    if (role.isSystemRole) {
      throw new BadRequestException('System roles cannot be deleted');
    }
    await this.roleRepository.delete({ id, tenantId });
  }

  async seedSystemRoles(tenantId: string): Promise<void> {
    for (const [, roleData] of Object.entries(SYSTEM_ROLES)) {
      const existing = await this.roleRepository.findOne({
        where: { name: roleData.name, tenantId },
      });
      if (!existing) {
        const role = this.roleRepository.create({
          ...roleData,
          tenantId,
          isSystemRole: true,
        });
        await this.roleRepository.save(role);
      } else {
        // Keep system role permissions in sync as new modules are added.
        existing.permissions = roleData.permissions;
        existing.isSystemRole = true;
        await this.roleRepository.save(existing);
      }
    }
  }
}
