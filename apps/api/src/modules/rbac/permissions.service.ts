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
  'payroll:runs:read', 'payroll:runs:process', 'payroll:runs:approve',
  'payroll:payslips:read',
  'payroll:components:read', 'payroll:components:manage',
  'payroll:statutory:read', 'payroll:statutory:manage',
  // Procurement
  'procurement:requisitions:read', 'procurement:requisitions:create', 'procurement:requisitions:approve',
  'procurement:rfq:read', 'procurement:rfq:manage',
  'procurement:po:read', 'procurement:po:create', 'procurement:po:approve',
  'procurement:grn:read', 'procurement:grn:create',
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
  // Talent module
  'talent:ats:read', 'talent:ats:manage', 'talent:ats:hire',
  'talent:onboarding:read', 'talent:onboarding:manage',
  'talent:learning:read', 'talent:learning:manage',
  'talent:succession:read', 'talent:succession:manage',
  'talent:goals:read', 'talent:goals:create', 'talent:goals:manage',
  'talent:performance:read', 'talent:performance:submit', 'talent:performance:manage', 'talent:performance:calibrate',
  'talent:appraisal:read', 'talent:appraisal:manage',
  // Localization module
  'localization:read',
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
      ...ALL_PERMISSIONS.filter(p => p.startsWith('talent:')),
      'users:users:read',
      'workflow:instances:approve',
      'workflow:instances:read',
      'procurement:requisitions:read',
      'procurement:requisitions:create',
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
      'procurement:po:approve',
      'procurement:po:read',
      'procurement:grn:read',
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
      'payroll:payslips:read',
      'talent:goals:read',
      'talent:goals:create',
      'talent:performance:read',
      'talent:performance:submit',
      'talent:ats:read',
      'talent:learning:read',
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
  PROCUREMENT_MANAGER: {
    name: 'Procurement Manager',
    description: 'Full procurement module access',
    permissions: ALL_PERMISSIONS.filter(p => p.startsWith('procurement:')),
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
