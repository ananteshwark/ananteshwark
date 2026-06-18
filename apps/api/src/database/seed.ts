import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TenantsService } from '../modules/tenants/tenants.service';
import { UsersService } from '../modules/users/users.service';
import { RbacService } from '../modules/rbac/rbac.service';
import { WorkflowService } from '../modules/workflow/workflow.service';
import { TenantPlan, TenantStatus } from '../modules/tenants/entities/tenant.entity';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const tenantsService = app.get(TenantsService);
  const usersService = app.get(UsersService);
  const rbacService = app.get(RbacService);
  const workflowService = app.get(WorkflowService);

  console.log('Seeding demo tenant...');
  let tenant;
  try {
    tenant = await tenantsService.create({
      name: 'Demo Company',
      slug: 'demo',
      plan: TenantPlan.PROFESSIONAL,
    });
    await tenantsService.update(tenant.id, {
      status: TenantStatus.ACTIVE,
      settings: {
        enabledModules: ['hr', 'finance', 'payroll', 'procurement', 'inventory', 'crm'],
        locale: 'en',
        timezone: 'UTC',
        baseCurrency: 'USD',
        fiscalYearStart: 1,
        branding: { primaryColor: '#2563EB' },
      },
    });
    console.log('Demo tenant created:', tenant.id);
  } catch (e) {
    console.log('Demo tenant already exists, loading...');
    tenant = await tenantsService.findBySlug('demo');
  }

  console.log('Seeding system roles...');
  await rbacService.seedSystemRoles(tenant.id);
  console.log('System roles seeded');

  console.log('Seeding admin user...');
  try {
    const adminUser = await usersService.create(tenant.id, {
      email: 'admin@demo.com',
      firstName: 'Admin',
      lastName: 'User',
      password: 'Admin@123',
    });
    console.log('Admin user created:', adminUser.id);
  } catch (e) {
    console.log('Admin user already exists');
  }

  console.log('Seeding demo users...');
  const demoUsers = [
    { email: 'hr@demo.com', firstName: 'Sarah', lastName: 'HR', password: 'Demo@123' },
    { email: 'finance@demo.com', firstName: 'Mike', lastName: 'Finance', password: 'Demo@123' },
    { email: 'employee@demo.com', firstName: 'John', lastName: 'Employee', password: 'Demo@123' },
    { email: 'payroll@demo.com', firstName: 'Lisa', lastName: 'Payroll', password: 'Demo@123' },
    { email: 'recruiter@demo.com', firstName: 'Tom', lastName: 'Recruiter', password: 'Demo@123' },
  ];
  for (const userData of demoUsers) {
    try {
      await usersService.create(tenant.id, userData);
      console.log('Created user:', userData.email);
    } catch (e) {
      console.log('User already exists:', userData.email);
    }
  }

  console.log('Seeding workflow definitions...');
  try {
    await workflowService.createDefinition(tenant.id, null, {
      name: 'Leave Approval',
      description: 'Two-step leave approval: Manager then HR',
      triggerModule: 'hr',
      triggerEvent: 'leave_request',
      steps: [
        {
          id: 'step1',
          name: 'Manager Approval',
          type: 'approval',
          approvers: [{ type: 'manager', value: 'direct_manager' }],
          onApproveNext: 'step2',
          onRejectNext: null,
        },
        {
          id: 'step2',
          name: 'HR Approval',
          type: 'approval',
          approvers: [{ type: 'role', value: 'HR Manager' }],
          onApproveNext: null,
          onRejectNext: null,
        },
      ],
    });

    await workflowService.createDefinition(tenant.id, null, {
      name: 'Expense Approval',
      description: 'Manager approval for expenses under $1000',
      triggerModule: 'finance',
      triggerEvent: 'expense_request',
      steps: [
        {
          id: 'step1',
          name: 'Manager Approval',
          type: 'approval',
          approvers: [{ type: 'manager', value: 'direct_manager' }],
          onApproveNext: null,
          onRejectNext: null,
        },
      ],
    });

    await workflowService.createDefinition(tenant.id, null, {
      name: 'Purchase Order Approval',
      description: 'Finance Manager approval for purchase orders',
      triggerModule: 'procurement',
      triggerEvent: 'purchase_order',
      steps: [
        {
          id: 'step1',
          name: 'Finance Manager Approval',
          type: 'approval',
          approvers: [{ type: 'role', value: 'Finance Manager' }],
          onApproveNext: null,
          onRejectNext: null,
        },
      ],
    });

    console.log('Workflow definitions seeded');
  } catch (e) {
    console.log('Error seeding workflows:', e.message);
  }

  console.log('\nSeed complete!');
  console.log('Demo credentials:');
  console.log('  Email: admin@demo.com');
  console.log('  Password: Admin@123');
  console.log('  Tenant slug: demo');

  await app.close();
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
