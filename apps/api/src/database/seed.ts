import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TenantsService } from '../modules/tenants/tenants.service';
import { UsersService } from '../modules/users/users.service';
import { RbacService } from '../modules/rbac/rbac.service';
import { PermissionsService } from '../modules/rbac/permissions.service';
import { RequisitionService } from '../modules/procurement/requisition/requisition.service';
import { PoService } from '../modules/procurement/po/po.service';
import { GrnService } from '../modules/procurement/grn/grn.service';
import { WorkflowService } from '../modules/workflow/workflow.service';
import { TenantPlan, TenantStatus } from '../modules/tenants/entities/tenant.entity';
import { GlService } from '../modules/finance/gl/gl.service';
import { ApService } from '../modules/finance/ap/ap.service';
import { ArService } from '../modules/finance/ar/ar.service';
import { EmployeeService } from '../modules/hr/employees/employee.service';
import { AttendanceService } from '../modules/hr/attendance/attendance.service';
import { LeaveService } from '../modules/hr/leave/leave.service';
import { AttendanceSource, AttendanceStatus } from '../modules/hr/attendance/entities/attendance-record.entity';
import { AccrualType } from '../modules/hr/leave/entities/leave-type.entity';
import { ComponentService } from '../modules/payroll/components/component.service';
import { StatutoryService } from '../modules/payroll/statutory/statutory.service';
import {
  PayComponentType,
  CalculationType,
  StatutoryType,
} from '../modules/payroll/components/entities/pay-component.entity';
import { TaxRegime } from '../modules/payroll/statutory/entities/tax-slab.entity';
import { ComplianceType, ComplianceFrequency } from '../modules/payroll/statutory/entities/compliance-calendar-item.entity';
import { DataSource } from 'typeorm';
import { TaxSlab } from '../modules/payroll/statutory/entities/tax-slab.entity';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const tenantsService = app.get(TenantsService);
  const usersService = app.get(UsersService);
  const rbacService = app.get(RbacService);
  const permissionsService = app.get(PermissionsService);
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
        enabledModules: ['hr', 'finance', 'payroll', 'procurement', 'inventory', 'crm', 'projects', 'expenses', 'talent'],
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

  // Grant the admin user the Tenant Admin role (idempotent).
  try {
    const adminUser = await usersService.findByEmail('admin@demo.com', tenant.id);
    const roles = await rbacService.findAll(tenant.id);
    const adminRole = roles.find((r) => r.name === 'Tenant Admin');
    if (adminUser && adminRole) {
      await permissionsService.assignRole(adminUser.id, adminRole.id, tenant.id, adminUser.id);
      console.log('Assigned Tenant Admin role to admin@demo.com');
    }
  } catch (e) {
    console.log('Admin role assignment skipped:', (e as Error).message);
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
    // Payroll statutory payables
    { code: '2110', name: 'PF Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
    { code: '2120', name: 'ESI Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
    { code: '2130', name: 'PT Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
    { code: '2140', name: 'TDS Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
    { code: '2150', name: 'Salaries Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
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
    // Payroll employer contribution expenses
    { code: '6010', name: 'Employer PF Contribution', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '6020', name: 'Employer ESI Contribution', type: 'EXPENSE', normalBalance: 'DEBIT' },
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

  // HR seed data
  console.log('\nSeeding HR data...');
  const employeeService = app.get(EmployeeService);
  const attendanceService = app.get(AttendanceService);
  const leaveService = app.get(LeaveService);

  // Departments
  let engDept: any, hrDept: any;
  try {
    engDept = await employeeService.createDepartment(tenant.id, { code: 'ENG', name: 'Engineering' });
    console.log('Created Engineering department');
  } catch (e) {
    console.log('Engineering department already exists');
    const depts = await employeeService.findDepartments(tenant.id, { page: 1, limit: 100 });
    engDept = depts.items.find((d: any) => d.code === 'ENG');
  }
  try {
    hrDept = await employeeService.createDepartment(tenant.id, { code: 'HR-DEPT', name: 'Human Resources' });
    console.log('Created HR department');
  } catch (e) {
    console.log('HR department already exists');
    const depts = await employeeService.findDepartments(tenant.id, { page: 1, limit: 100 });
    hrDept = depts.items.find((d: any) => d.code === 'HR-DEPT');
  }

  // Designations
  let seDesig: any, hrmDesig: any;
  try {
    seDesig = await employeeService.createDesignation(tenant.id, { code: 'SE', name: 'Software Engineer', level: 3 });
    console.log('Created Software Engineer designation');
  } catch (e) {
    console.log('Software Engineer designation already exists');
    const desigs = await employeeService.findDesignations(tenant.id, { page: 1, limit: 100 });
    seDesig = desigs.items.find((d: any) => d.code === 'SE');
  }
  try {
    hrmDesig = await employeeService.createDesignation(tenant.id, { code: 'HRM', name: 'HR Manager', level: 5 });
    console.log('Created HR Manager designation');
  } catch (e) {
    console.log('HR Manager designation already exists');
    const desigs = await employeeService.findDesignations(tenant.id, { page: 1, limit: 100 });
    hrmDesig = desigs.items.find((d: any) => d.code === 'HRM');
  }

  // Location
  try {
    await employeeService.createLocation(tenant.id, { code: 'HO', name: 'Head Office', city: 'Mumbai', state: 'Maharashtra', country: 'India', timezone: 'Asia/Kolkata' });
    console.log('Created Head Office location');
  } catch (e) {
    console.log('Head Office location already exists');
  }

  // Employees
  let emp1: any, emp2: any, emp3: any;
  try {
    emp1 = await employeeService.createEmployee(tenant.id, {
      employeeCode: 'EMP-001',
      firstName: 'Sarah',
      lastName: 'HR',
      email: 'hr.emp@demo.com',
      dateOfJoining: '2024-01-01',
      designationId: hrmDesig?.id,
      departmentId: hrDept?.id,
      employmentType: 'FULL_TIME' as any,
    });
    console.log('Created employee EMP-001');
  } catch (e) {
    console.log('Employee EMP-001 already exists');
    const emps = await employeeService.findEmployees(tenant.id, { page: 1, limit: 100 }, { search: 'EMP-001' });
    emp1 = emps.items[0];
  }
  try {
    emp2 = await employeeService.createEmployee(tenant.id, {
      employeeCode: 'EMP-002',
      firstName: 'John',
      lastName: 'Developer',
      email: 'dev1@demo.com',
      dateOfJoining: '2024-03-01',
      designationId: seDesig?.id,
      departmentId: engDept?.id,
      employmentType: 'FULL_TIME' as any,
    });
    console.log('Created employee EMP-002');
  } catch (e) {
    console.log('Employee EMP-002 already exists');
    const emps = await employeeService.findEmployees(tenant.id, { page: 1, limit: 100 }, { search: 'EMP-002' });
    emp2 = emps.items[0];
  }
  try {
    emp3 = await employeeService.createEmployee(tenant.id, {
      employeeCode: 'EMP-003',
      firstName: 'Jane',
      lastName: 'Developer',
      email: 'dev2@demo.com',
      dateOfJoining: '2024-06-01',
      designationId: seDesig?.id,
      departmentId: engDept?.id,
      managerId: emp2?.id,
      employmentType: 'FULL_TIME' as any,
    });
    console.log('Created employee EMP-003');
  } catch (e) {
    console.log('Employee EMP-003 already exists');
    const emps = await employeeService.findEmployees(tenant.id, { page: 1, limit: 100 }, { search: 'EMP-003' });
    emp3 = emps.items[0];
  }

  // Leave Types
  let annualLeave: any, sickLeave: any, casualLeave: any;
  try {
    annualLeave = await leaveService.createLeaveType(tenant.id, {
      code: 'AL',
      name: 'Annual Leave',
      accrualType: AccrualType.MONTHLY,
      accrualRate: 1.5,
      maxBalance: 18,
      maxCarryForward: 5,
      isPaid: true,
    });
    console.log('Created Annual Leave type');
  } catch (e) {
    console.log('Annual Leave type already exists');
    const types = await leaveService.listLeaveTypes(tenant.id);
    annualLeave = types.find((t: any) => t.code === 'AL');
  }
  try {
    sickLeave = await leaveService.createLeaveType(tenant.id, {
      code: 'SL',
      name: 'Sick Leave',
      accrualType: AccrualType.MONTHLY,
      accrualRate: 1,
      maxBalance: 12,
      maxCarryForward: 0,
      isPaid: true,
    });
    console.log('Created Sick Leave type');
  } catch (e) {
    console.log('Sick Leave type already exists');
    const types = await leaveService.listLeaveTypes(tenant.id);
    sickLeave = types.find((t: any) => t.code === 'SL');
  }
  try {
    casualLeave = await leaveService.createLeaveType(tenant.id, {
      code: 'CL',
      name: 'Casual Leave',
      accrualType: AccrualType.MANUAL,
      accrualRate: 6,
      maxBalance: 6,
      maxCarryForward: 0,
      isPaid: true,
    });
    console.log('Created Casual Leave type');
  } catch (e) {
    console.log('Casual Leave type already exists');
    const types = await leaveService.listLeaveTypes(tenant.id);
    casualLeave = types.find((t: any) => t.code === 'CL');
  }

  // Leave Balances for demo employees
  const leaveYear = 2026;
  const employees_for_leave = [emp1, emp2, emp3].filter(Boolean);
  for (const emp of employees_for_leave) {
    for (const lt of [annualLeave, sickLeave, casualLeave].filter(Boolean)) {
      try {
        await leaveService.accrueLeave(tenant.id, emp.id, lt.id, lt.accrualRate * 6, `${leaveYear}-06-01`);
        console.log(`Accrued ${lt.code} for ${emp.employeeCode}`);
      } catch (e) {
        console.log(`Leave balance already exists for ${emp.employeeCode} / ${lt.code}`);
      }
    }
  }

  // Attendance records for current week
  const today = new Date();
  const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  for (const emp of employees_for_leave) {
    for (let i = 0; i < 5; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      if (day > today) break;
      const dateStr = day.toISOString().split('T')[0];
      const checkIn = new Date(day);
      checkIn.setHours(9, 0, 0, 0);
      const checkOut = new Date(day);
      checkOut.setHours(18, 0, 0, 0);
      try {
        await attendanceService.markAttendance(tenant.id, {
          employeeId: emp.id,
          date: dateStr,
          checkIn: checkIn.toISOString(),
          checkOut: checkOut.toISOString(),
          source: AttendanceSource.MANUAL,
          status: AttendanceStatus.PRESENT,
        });
        console.log(`Attendance marked for ${emp.employeeCode} on ${dateStr}`);
      } catch (e) {
        console.log(`Attendance already exists for ${emp.employeeCode} on ${dateStr}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // PAYROLL seed data (Phase 4)
  // ---------------------------------------------------------------------------
  console.log('\nSeeding Payroll data...');
  const componentService = app.get(ComponentService);
  const statutoryService = app.get(StatutoryService);

  const payComponents = [
    { code: 'BASIC', name: 'Basic', type: PayComponentType.EARNING, calculationType: CalculationType.PERCENTAGE, percentageOf: 'CTC', isTaxable: true, glAccountCode: '6000', displayOrder: 1 },
    { code: 'HRA', name: 'House Rent Allowance', type: PayComponentType.EARNING, calculationType: CalculationType.PERCENTAGE, percentageOf: 'BASIC', isTaxable: true, glAccountCode: '6000', displayOrder: 2 },
    { code: 'SPECIAL_ALLOWANCE', name: 'Special Allowance', type: PayComponentType.EARNING, calculationType: CalculationType.FORMULA, isTaxable: true, glAccountCode: '6000', displayOrder: 3 },
    { code: 'PF_EMPLOYEE', name: 'Provident Fund (Employee)', type: PayComponentType.DEDUCTION, calculationType: CalculationType.PERCENTAGE, percentageOf: 'BASIC', isStatutory: true, statutoryType: StatutoryType.PF, glAccountCode: '2110', displayOrder: 10 },
    { code: 'ESI_EMPLOYEE', name: 'ESI (Employee)', type: PayComponentType.DEDUCTION, calculationType: CalculationType.PERCENTAGE, percentageOf: 'GROSS', isStatutory: true, statutoryType: StatutoryType.ESI, glAccountCode: '2120', displayOrder: 11 },
    { code: 'PT', name: 'Professional Tax', type: PayComponentType.DEDUCTION, calculationType: CalculationType.SLAB, isStatutory: true, statutoryType: StatutoryType.PT, glAccountCode: '2130', displayOrder: 12 },
    { code: 'TDS', name: 'Income Tax (TDS)', type: PayComponentType.DEDUCTION, calculationType: CalculationType.SLAB, isStatutory: true, statutoryType: StatutoryType.TDS, glAccountCode: '2140', displayOrder: 13 },
    { code: 'PF_EMPLOYER', name: 'Provident Fund (Employer)', type: PayComponentType.EMPLOYER_CONTRIBUTION, calculationType: CalculationType.PERCENTAGE, percentageOf: 'BASIC', isStatutory: true, statutoryType: StatutoryType.PF, glAccountCode: '6010', displayOrder: 20 },
    { code: 'ESI_EMPLOYER', name: 'ESI (Employer)', type: PayComponentType.EMPLOYER_CONTRIBUTION, calculationType: CalculationType.PERCENTAGE, percentageOf: 'GROSS', isStatutory: true, statutoryType: StatutoryType.ESI, glAccountCode: '6020', displayOrder: 21 },
  ];
  const componentMap: Record<string, any> = {};
  for (const pc of payComponents) {
    try {
      const created = await componentService.createComponent(tenant.id, pc as any);
      componentMap[pc.code] = created;
      console.log('Created pay component:', pc.code);
    } catch (e) {
      console.log('Pay component already exists:', pc.code);
      const list = await componentService.findComponents(tenant.id, { page: 1, limit: 100 });
      const found = list.items.find((c: any) => c.code === pc.code);
      if (found) componentMap[pc.code] = found;
    }
  }

  // Salary structure "Standard India"
  let standardStructure: any;
  try {
    const structureComps = [
      { componentId: componentMap['BASIC']?.id, percentage: 40, sequence: 1 },
      { componentId: componentMap['HRA']?.id, percentage: 50, sequence: 2 },
      { componentId: componentMap['SPECIAL_ALLOWANCE']?.id, sequence: 3 },
    ].filter((c) => c.componentId);
    standardStructure = await componentService.createStructure(tenant.id, {
      name: 'Standard India',
      description: 'Default India salary structure (Basic 40% CTC, HRA 50% Basic, Special balancing)',
      components: structureComps as any,
    });
    console.log('Created salary structure: Standard India');
  } catch (e) {
    console.log('Salary structure error / exists:', e.message);
    const structures = await componentService.findStructures(tenant.id);
    standardStructure = structures.find((s: any) => s.name === 'Standard India');
  }

  // Employee salaries
  const salaryAssignments = [
    { emp: emp1, ctc: 1200000 },
    { emp: emp2, ctc: 800000 },
    { emp: emp3, ctc: 600000 },
  ].filter((a) => a.emp);
  for (const a of salaryAssignments) {
    try {
      const existing = await componentService.getEmployeeSalary(tenant.id, a.emp.id, '2026-01-01');
      if (existing) {
        console.log(`Salary already assigned for ${a.emp.employeeCode}`);
        continue;
      }
      await componentService.assignSalary(tenant.id, {
        employeeId: a.emp.id,
        structureId: standardStructure?.id,
        ctc: a.ctc,
        effectiveFrom: '2026-01-01',
      });
      console.log(`Assigned salary CTC ${a.ctc} to ${a.emp.employeeCode}`);
    } catch (e) {
      console.log(`Salary assignment error for ${a.emp.employeeCode}:`, e.message);
    }
  }

  // Statutory configs (India defaults)
  const statConfigs = [
    { type: StatutoryType.PF, config: { rate: 0.12, wageCeiling: 15000 } },
    { type: StatutoryType.ESI, config: { employeeRate: 0.0075, employerRate: 0.0325, grossThreshold: 21000 } },
    { type: StatutoryType.PT, config: { state: 'Maharashtra', slabs: [{ upTo: 7500, amount: 0 }, { upTo: 10000, amount: 175 }, { upTo: null, amount: 200 }], februaryExtra: 100 } },
    { type: StatutoryType.TDS, config: { standardDeduction: 75000, rebate87ALimit: 700000, cess: 0.04 } },
  ];
  for (const sc of statConfigs) {
    try {
      await statutoryService.upsertStatutoryConfig(tenant.id, { type: sc.type, isEnabled: true, config: sc.config, effectiveFrom: '2025-04-01' } as any);
      console.log('Statutory config seeded:', sc.type);
    } catch (e) {
      console.log('Statutory config error:', sc.type, e.message);
    }
  }

  // Tax slabs (NEW regime FY2025-26)
  try {
    const ds = app.get(DataSource);
    const slabRepo = ds.getRepository(TaxSlab);
    const existingSlabs = await slabRepo.count({ where: { tenantId: tenant.id, regime: TaxRegime.NEW, financialYear: '2025-26' } });
    if (existingSlabs === 0) {
      const slabRows = [
        { from: 0, to: 300000, rate: 0 },
        { from: 300000, to: 700000, rate: 5 },
        { from: 700000, to: 1000000, rate: 10 },
        { from: 1000000, to: 1200000, rate: 15 },
        { from: 1200000, to: 1500000, rate: 20 },
        { from: 1500000, to: null, rate: 30 },
      ];
      for (const r of slabRows) {
        await slabRepo.save(slabRepo.create({ tenantId: tenant.id, regime: TaxRegime.NEW, financialYear: '2025-26', fromAmount: r.from, toAmount: r.to, rate: r.rate, surcharge: 0 }));
      }
      console.log('Tax slabs seeded (NEW FY2025-26)');
    } else {
      console.log('Tax slabs already exist');
    }
  } catch (e) {
    console.log('Tax slab seed error:', e.message);
  }

  // Compliance calendar for current month
  try {
    const now = new Date();
    await statutoryService.generateMonthlyComplianceItems(tenant.id, now.getMonth() + 1, now.getFullYear());
    console.log('Compliance calendar items generated');
  } catch (e) {
    console.log('Compliance calendar error:', e.message);
  }

  // ---------------------------------------------------------------------------
  // PROCUREMENT seed data (Phase 5)
  // ---------------------------------------------------------------------------
  console.log('\nSeeding Procurement data...');
  const requisitionService = app.get(RequisitionService);
  const poService = app.get(PoService);
  const grnService = app.get(GrnService);

  // Get admin user for requestedByUserId
  let adminUserId: string | null = null;
  try {
    const adminUser = await usersService.findByEmail('admin@demo.com', tenant.id);
    adminUserId = adminUser?.id || null;
  } catch (e) {
    console.log('Could not find admin user for procurement seed');
  }

  // Get a vendor (VENDOR-001)
  let procVendor: any = null;
  try {
    const vList = await apService.findVendors(tenant.id, { page: 1, limit: 10 }, 'Acme');
    procVendor = vList.items[0] || null;
  } catch (e) {
    console.log('Could not find vendor for procurement seed');
  }

  // Sample requisition 1 — DRAFT
  let req1: any;
  try {
    req1 = await requisitionService.createRequisition(tenant.id, adminUserId || '', {
      title: 'Office Supplies Q3 2026',
      description: 'Quarterly office supplies requisition',
      priority: 'MEDIUM' as any,
      requiredBy: '2026-07-31',
      lines: [
        { description: 'A4 Paper Reams', quantity: 50, unitPrice: 500, uom: 'REAM' },
        { description: 'Ball Pens Box', quantity: 10, unitPrice: 200, uom: 'BOX' },
      ],
    });
    console.log('Created DRAFT requisition:', req1.reqNumber);
  } catch (e) {
    console.log('DRAFT requisition seed error:', e.message);
  }

  // Sample requisition 2 — APPROVED
  let req2: any;
  try {
    const r = await requisitionService.createRequisition(tenant.id, adminUserId || '', {
      title: 'Laptop Purchase for Engineering',
      description: 'New laptops for engineering team expansion',
      priority: 'HIGH' as any,
      requiredBy: '2026-07-15',
      lines: [
        { description: 'Dell Laptop 15"', quantity: 3, unitPrice: 85000, uom: 'PCS' },
        { description: 'Laptop Bag', quantity: 3, unitPrice: 2000, uom: 'PCS' },
      ],
    });
    await requisitionService.submitRequisition(tenant.id, r.id);
    req2 = await requisitionService.approveRequisition(tenant.id, r.id, adminUserId || '');
    console.log('Created APPROVED requisition:', req2.reqNumber);
  } catch (e) {
    console.log('APPROVED requisition seed error:', e.message);
  }

  // Sample PO linked to approved requisition
  let po1: any;
  if (procVendor && req2) {
    try {
      const created = await poService.createPo(tenant.id, {
        vendorId: procVendor.id,
        vendorName: procVendor.name,
        requisitionId: req2.id,
        poDate: '2026-06-19',
        deliveryDate: '2026-07-10',
        currency: 'INR',
        notes: 'Urgent delivery required',
        lines: [
          { description: 'Dell Laptop 15"', quantity: 3, unitPrice: 85000, uom: 'PCS', taxRate: 18 },
          { description: 'Laptop Bag', quantity: 3, unitPrice: 2000, uom: 'PCS', taxRate: 18 },
        ],
      });
      po1 = await poService.approvePo(tenant.id, created.id, adminUserId || '');
      console.log('Created APPROVED PO:', po1.poNumber);
    } catch (e) {
      console.log('PO seed error:', e.message);
    }
  }

  // Sample GRN against the PO
  if (po1) {
    try {
      const sent = await poService.sendPo(tenant.id, po1.id);
      const poDetail = await poService.findOne(tenant.id, sent.id);
      const poLines = poDetail.lines as any[];
      const grn = await grnService.createGrn(tenant.id, {
        poId: po1.id,
        receiptDate: '2026-06-25',
        notes: 'All items received in good condition',
        lines: poLines.map((l: any) => ({
          poLineId: l.id,
          quantityReceived: l.quantity,
          quantityAccepted: l.quantity,
          quantityRejected: 0,
        })),
      });
      console.log('Created DRAFT GRN:', grn.grnNumber);
      // Note: confirmGrn requires a running transaction with GL; skip auto-confirm in seed
    } catch (e) {
      console.log('GRN seed error:', e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // LOCALIZATION seed data (Phase 8)
  // ---------------------------------------------------------------------------
  console.log('\nSeeding Localization data (Phase 8)...');
  try {
    const StatutoryConfigRepo = app.get(DataSource).getRepository('pay_statutory_configs');
    // US config
    const usExists = await StatutoryConfigRepo.findOne({
      where: { tenantId: tenant.id, type: 'TDS', country: 'US' },
    });
    if (!usExists) {
      await StatutoryConfigRepo.save([
        {
          tenantId: tenant.id,
          type: 'TDS',
          country: 'US',
          isEnabled: true,
          config: { regime: 'SINGLE', wageBase2024: 168600 },
          effectiveFrom: '2024-01-01',
        },
      ]);
      console.log('US statutory config seeded');
    } else {
      console.log('US statutory config already exists');
    }
    // UAE config
    const aeExists = await StatutoryConfigRepo.findOne({
      where: { tenantId: tenant.id, type: 'GRATUITY', country: 'AE' },
    });
    if (!aeExists) {
      await StatutoryConfigRepo.save([
        {
          tenantId: tenant.id,
          type: 'GRATUITY',
          country: 'AE',
          isEnabled: true,
          config: { accrualDaysPerYear: 21, nationalRate: 0.125 },
          effectiveFrom: '2024-01-01',
        },
      ]);
      console.log('UAE statutory config seeded');
    } else {
      console.log('UAE statutory config already exists');
    }
    console.log('Phase 8 localization seed done');
  } catch (e) {
    console.log('Phase 8 seed skipped:', e.message);
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
