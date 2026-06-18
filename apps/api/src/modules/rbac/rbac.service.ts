import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { CreateRoleDto, UpdateRoleDto } from './dto/rbac.dto';
import { SYSTEM_ROLES } from './permissions.service';

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async createRole(tenantId: string, dto: CreateRoleDto): Promise<Role> {
    const role = this.roleRepository.create({ ...dto, tenantId, permissions: dto.permissions || [] });
    return this.roleRepository.save(role);
  }

  async findAll(tenantId: string): Promise<Role[]> {
    return this.roleRepository
      .createQueryBuilder('role')
      .where('role.tenantId = :tenantId OR role.isSystemRole = true', { tenantId })
      .orderBy('role.name', 'ASC')
      .getMany();
  }

  async findById(id: string): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    return role;
  }

  async update(id: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.findById(id);
    Object.assign(role, dto);
    return this.roleRepository.save(role);
  }

  async delete(id: string): Promise<void> {
    await this.roleRepository.delete(id);
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
      }
    }
  }
}
