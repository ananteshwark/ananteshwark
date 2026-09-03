import { LocalizationRegistry } from '../../localization/localization.registry';

/**
 * Multi-country payroll wiring: the run engine resolves statutory deductions
 * through the localization pack registry by employee payrollCountry, keeping
 * the config-driven India path for 'IN' (and when no registry is wired).
 */
describe('Payroll runs — country pack dispatch', () => {
  const { RunService } = require('./run.service');

  const mockRepo = () => ({
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn((x: any) => Promise.resolve(x)),
    create: jest.fn((x: any) => x),
    delete: jest.fn(),
  });

  const makeService = (registry?: LocalizationRegistry) => {
    const runRepo = mockRepo();
    runRepo.findOne.mockResolvedValue({
      id: 'run-1', tenantId: 't1', status: 'DRAFT', payPeriodMonth: 6, payPeriodYear: 2026,
      periodEnd: '2026-06-30',
    });
    const employeeRepo = mockRepo();
    employeeRepo.find.mockResolvedValue([
      { id: 'e-us', employeeCode: 'US1', firstName: 'Uma', lastName: 'Smith', status: 'ACTIVE', payrollCountry: 'US' },
      { id: 'e-in', employeeCode: 'IN1', firstName: 'Isha', lastName: 'Rao', status: 'ACTIVE', payrollCountry: 'IN' },
    ]);
    const componentService = {
      getEmployeeSalary: jest.fn().mockResolvedValue({
        components: [
          { code: 'BASIC', name: 'Basic', type: 'EARNING', amount: 5000 },
        ],
      }),
    };
    const statutoryService = {
      calculatePF: jest.fn().mockResolvedValue({ employee: 600, employer: 600 }),
      calculateESI: jest.fn().mockResolvedValue({ employee: 0, employer: 0 }),
      calculatePT: jest.fn().mockResolvedValue(200),
      calculateTDS: jest.fn().mockResolvedValue({ monthly: 0 }),
    };
    // Transaction runner: hand the callback a manager backed by our mocks.
    const savedPayslips: any[] = [];
    const manager = {
      delete: jest.fn(),
      create: jest.fn((_entity: any, data: any) => data),
      save: jest.fn((x: any) => { if (x.employeeId) savedPayslips.push(x); return Promise.resolve(x); }),
    };
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };
    const service = new RunService(
      runRepo, mockRepo(), employeeRepo, mockRepo(), // run, payslip, employee, account
      componentService, statutoryService,
      { getArrearsForRun: jest.fn().mockResolvedValue([]), applyRetroArrears: jest.fn() } as any, // retro
      {} as any, // gl
      {} as any, // payrollGl
      dataSource as any,
      undefined, // automation
      registry,
    );
    return { service, savedPayslips, statutoryService };
  };

  const usPack = {
    country: 'US', name: 'United States',
    calculateStatutory: jest.fn(() => ({
      employeeDeductions: [
        { code: 'FED_TAX', name: 'Federal Income Tax', amount: 450 },
        { code: 'FICA_SS', name: 'Social Security', amount: 310 },
        { code: 'ZERO', name: 'Ignored', amount: 0 },
      ],
      employerContributions: [{ code: 'FICA_SS_ER', name: 'Social Security (Employer)', amount: 310 }],
      netPay: 0,
    })),
    getComplianceCalendarItems: () => [],
  };

  it('routes non-IN employees through their pack, IN through the legacy path', async () => {
    const registry = new LocalizationRegistry();
    registry.register(usPack as any);
    const { service, savedPayslips, statutoryService } = makeService(registry);

    await service.processRun('t1', 'run-1', 'user-1');

    const us = savedPayslips.find((p) => p.employeeId === 'e-us');
    const india = savedPayslips.find((p) => p.employeeId === 'e-in');

    // US payslip: pack deductions, zero-amount lines dropped, no PF anywhere
    expect(us.deductions.map((d: any) => d.code)).toEqual(['FED_TAX', 'FICA_SS']);
    expect(us.employerContribs.map((d: any) => d.code)).toEqual(['FICA_SS_ER']);
    expect(us.totalDeductions).toBe(760);
    expect(usPack.calculateStatutory).toHaveBeenCalledWith(expect.objectContaining({
      grossMonthly: 5000, basicMonthly: 5000, country: 'US',
    }));

    // India payslip untouched: PF + PT from the statutory service
    expect(india.deductions.map((d: any) => d.code)).toEqual(expect.arrayContaining(['PF_EMPLOYEE', 'PT']));
    expect(statutoryService.calculatePF).toHaveBeenCalledTimes(1); // only for the IN employee
  });

  it('without a registry every employee falls back to the India path (legacy behavior)', async () => {
    const { service, savedPayslips, statutoryService } = makeService(undefined);
    await service.processRun('t1', 'run-1', 'user-1');
    expect(statutoryService.calculatePF).toHaveBeenCalledTimes(2);
    expect(savedPayslips.every((p) => p.deductions.some((d: any) => d.code === 'PF_EMPLOYEE'))).toBe(true);
  });
});
