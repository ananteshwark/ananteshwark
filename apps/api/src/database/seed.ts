import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TenantsService } from '../modules/tenants/tenants.service';
import { UsersService } from '../modules/users/users.service';
import { RbacService } from '../modules/rbac/rbac.service';
import { WorkflowService } from '../modules/workflow/workflow.service';
import { TenantPlan, TenantStatus } from '../modules/tenants/entities/tenant.entity';
import { GlService } from '../modules/finance/gl/gl.service';
import { ApService } from '../modules/finance/ap/ap.service';
import { ArService } from '../modules/finance/ar/ar.service';

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

  // Seed Chart of Accounts
  console.log('Seeding chart of accounts...');
  const glService = app.get(GlService);
  const apService = app.get(ApService);
  const arService = app.get(ArService);

  const accounts = [
    // Assets
    { code: '1000', name: 'Cash', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '1010', name: 'Bank', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '1100', name: 'AR Control', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '1200', name: 'Inventory', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '1300', name: 'Prepaid Expenses', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '1500', name: 'Fixed Assets', type: 'ASSET', normalBalance: 'DEBIT' },
    // Liabilities
    { code: '2000', name: 'AP Control', type: 'LIABILITY', normalBalance: 'CREDIT' },
    { code: '2100', name: 'Tax Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
    { code: '2200', name: 'Accrued Liabilities', type: 'LIABILITY', normalBalance: 'CREDIT' },
    { code: '2300', name: 'Short-term Loans', type: 'LIABILITY', normalBalance: 'CREDIT' },
    // Equity
    { code: '3000', name: 'Common Stock', type: 'EQUITY', normalBalance: 'CREDIT' },
    { code: '3100', name: 'Retained Earnings', type: 'EQUITY', normalBalance: 'CREDIT' },
    // Income
    { code: '4000', name: 'Sales Revenue', type: 'INCOME', normalBalance: 'CREDIT' },
    { code: '4100', name: 'Service Revenue', type: 'INCOME', normalBalance: 'CREDIT' },
    { code: '4200', name: 'Other Income', type: 'INCOME', normalBalance: 'CREDIT' },
    // COGS / Expenses
    { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '6000', name: 'Salaries & Wages', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '6100', name: 'Rent', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '6200', name: 'Utilities', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '6300', name: 'Marketing', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '6400', name: 'Office Expenses', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '6500', name: 'Depreciation', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '6600', name: 'Interest Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
  ];

  for (const acc of accounts) {
    try {
      await glService.createAccount(tenant.id, acc as any);
      console.log('Created account:', acc.code, acc.name);
    } catch (e) {
      console.log('Account already exists:', acc.code);
    }
  }

  // Seed Fiscal Year FY2026
  console.log('Seeding FY2026...');
  try {
    await glService.createFiscalYear(tenant.id, {
      name: 'FY2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      generatePeriods: true,
    });
    console.log('FY2026 created with monthly periods');
  } catch (e) {
    console.log('FY2026 already exists');
  }

  // Seed vendors
  console.log('Seeding vendors...');
  try {
    await apService.createVendor(tenant.id, {
      code: 'VENDOR-001',
      name: 'Acme Supplies',
      email: 'accounts@acme.com',
      currency: 'USD',
      paymentTerms: 30,
    });
    console.log('Vendor VENDOR-001 created');
  } catch (e) {
    console.log('Vendor VENDOR-001 already exists');
  }
  try {
    await apService.createVendor(tenant.id, {
      code: 'VENDOR-002',
      name: 'Tech Corp',
      email: 'billing@techcorp.com',
      currency: 'USD',
      paymentTerms: 15,
    });
    console.log('Vendor VENDOR-002 created');
  } catch (e) {
    console.log('Vendor VENDOR-002 already exists');
  }

  // Seed customers
  console.log('Seeding customers...');
  try {
    await arService.createCustomer(tenant.id, {
      code: 'CUST-001',
      name: 'Global Corp',
      email: 'ap@globalcorp.com',
      currency: 'USD',
      paymentTerms: 30,
    });
    console.log('Customer CUST-001 created');
  } catch (e) {
    console.log('Customer CUST-001 already exists');
  }
  try {
    await arService.createCustomer(tenant.id, {
      code: 'CUST-002',
      name: 'Local Biz',
      email: 'owner@localbiz.com',
      currency: 'USD',
      paymentTerms: 15,
    });
    console.log('Customer CUST-002 created');
  } catch (e) {
    console.log('Customer CUST-002 already exists');
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
