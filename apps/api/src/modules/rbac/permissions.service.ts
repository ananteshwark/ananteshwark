import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from './entities/user-role.entity';
import { Role } from './entities/role.entity';

export const ALL_PERMISSIONS = [
  // HR module
  'hr:employees:read', 'hr:employees:create', 'hr:employees:update', 'hr:employees:delete',
  'hr:org:manage',
  'hr:attendance:read', 'hr:attendance:create', 'hr:attendance:approve',
  'hr:leave:read', 'hr:leave:apply', 'hr:leave:approve',
  'hr:timesheets:read', 'hr:timesheets:approve',
  // Finance module
  'finance:gl:read', 'finance:gl:create', 'finance:gl:update',
  'finance:invoices:read', 'finance:invoices:create', 'finance:invoices:update',
  'finance:accounts:read', 'finance:accounts:create', 'finance:accounts:update',
  'finance:journal:read', 'finance:journal:create', 'finance:journal:post', 'finance:journal:reverse',
  'finance:ar:read', 'finance:ar:create', 'finance:ar:post',
  'finance:ap:read', 'finance:ap:create', 'finance:ap:post',
  'finance:bank:read', 'finance:bank:create', 'finance:bank:reconcile',
  'finance:reports:read',
  // Payroll module
  'payroll:payroll_run:read', 'payroll:payroll_run:create', 'payroll:payroll_run:execute',
  'payroll:payslips:read',
  // Procurement
  'procurement:purchase_orders:read', 'procurement:purchase_orders:create',
  'procurement:purchase_orders:approve',
  // Users & RBAC
  'users:users:read', 'users:users:create', 'users:users:update', 'users:users:delete',
  'rbac:roles:read', 'rbac:roles:create', 'rbac:roles:update', 'rbac:roles:delete',
  // Audit
  'audit:logs:read',
  // Workflow
  'workflow:definitions:read', 'workflow:definitions:create',
  'workflow:instances:read', 'workflow:instances:approve',
  // Settings
  'settings:general:read', 'settings:general:update',
  'settings:modules:read', 'settings:modules:update',
];

export const SYSTEM_ROLES = {
  TENANT_ADMIN: {
    name: 'Tenant Admin',
    description: 'Full access to tenant',
    permissions: ALL_PERMISSIONS,
  },
  HR_MANAGER: {
    name: 'HR Manager',
    description: 'HR module full access',
    permissions: [
      ...ALL_PERMISSIONS.filter(p => p.startsWith('hr:')),
      'users:users:read',
      'workflow:instances:approve',
      'workflow:instances:read',
    ],
  },
  FINANCE_MANAGER: {
    name: 'Finance Manager',
    description: 'Finance module full access',
    permissions: [
      ...ALL_PERMISSIONS.filter(p => p.startsWith('finance:')),
      'workflow:instances:approve',
      'workflow:instances:read',
      'finance:accounts:read', 'finance:accounts:create', 'finance:accounts:update',
      'finance:journal:read', 'finance:journal:create', 'finance:journal:post', 'finance:journal:reverse',
      'finance:ap:read', 'finance:ap:create', 'finance:ap:post',
      'finance:ar:read', 'finance:ar:create', 'finance:ar:post',
      'finance:bank:read', 'finance:bank:create', 'finance:bank:reconcile',
      'finance:reports:read',
    ],
  },
  EMPLOYEE: {
    name: 'Employee',
    description: 'Basic employee access',
    permissions: [
      'hr:leave:apply',
      'hr:leave:read',
      'hr:attendance:read',
      'hr:employees:read',
      'hr:timesheets:read',
    ],
  },
  RECRUITER: {
    name: 'Recruiter',
    description: 'Recruitment access',
    permissions: ['hr:employees:read', 'hr:employees:create', 'hr:employees:update'],
  },
  PAYROLL_ADMIN: {
    name: 'Payroll Admin',
    description: 'Payroll module access',
    permissions: ALL_PERMISSIONS.filter(p => p.startsWith('payroll:')),
  },
};

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async getUserPermissions(userId: string, tenantId: string): Promise<string[]> {
    const userRoles = await this.userRoleRepository.find({
      where: { userId, tenantId },
      relations: ['role'],
    });

    const permissions = new Set<string>();
    for (const userRole of userRoles) {
      if (userRole.expiresAt && userRole.expiresAt < new Date()) continue;
      userRole.role?.permissions?.forEach(p => permissions.add(p));
    }
    return Array.from(permissions);
  }

  async userHasPermission(userId: string, tenantId: string, permission: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, tenantId);
    return permissions.includes(permission);
  }

  async assignRole(
    userId: string,
    roleId: string,
    tenantId: string,
    grantedBy: string,
  ): Promise<UserRole> {
    const existing = await this.userRoleRepository.findOne({
      where: { userId, roleId, tenantId },
    });
    if (existing) return existing;

    const userRole = this.userRoleRepository.create({
      userId,
      roleId,
      tenantId,
      grantedBy,
      grantedAt: new Date(),
    });
    return this.userRoleRepository.save(userRole);
  }

  async revokeRole(userId: string, roleId: string, tenantId: string): Promise<void> {
    await this.userRoleRepository.delete({ userId, roleId, tenantId });
  }

  getAllPermissions() {
    const grouped: Record<string, string[]> = {};
    for (const perm of ALL_PERMISSIONS) {
      const [module] = perm.split(':');
      if (!grouped[module]) grouped[module] = [];
      grouped[module].push(perm);
    }
    return grouped;
  }
}
