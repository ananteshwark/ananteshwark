import { NotFoundException, BadRequestException } from '@nestjs/common';
import { StatutoryFormsService, US_TAX_2025 } from './statutory-forms.service';
import { StatutoryFormType, StatutoryFormStatus } from './entities/statutory-form.entity';
import { EosbSettlementStatus, EosbTerminationType } from './entities/eosb-settlement.entity';
import { mockRepo } from '../../../../test/mock-repo';

function makeService(overrides: Partial<Record<string, any>> = {}): StatutoryFormsService {
  return new StatutoryFormsService(
    overrides.formRepo ?? mockRepo(),
    overrides.eosbRepo ?? mockRepo(),
    overrides.payslipRepo ?? mockRepo(),
    overrides.employeeRepo ?? mockRepo(),
  );
}

const employee = {
  id: 'emp-1', tenantId: 't1', firstName: 'Jane', lastName: 'Doe',
  currentState: 'CA', currentCity: 'LA', currentAddressLine1: '1 Main St',
  currentAddressLine2: '', currentPincode: '90001',
};

const yearPayslips = (gross: number, deductions: any[] = []) =>
  [1, 2, 3].map((m) => ({
    id: `ps-${m}`, tenantId: 't1', employeeId: 'emp-1', payPeriodYear: 2025,
    grossEarnings: gross, deductions,
  }));

// ─── W-2 box computation ────────────────────────────────────────────────────

describe('StatutoryFormsService.computeW2Boxes', () => {
  it('aggregates gross into box1 and classifies withholdings', async () => {
    const payslipRepo = mockRepo();
    payslipRepo.find.mockResolvedValue(
      yearPayslips(10000, [
        { code: 'FED_TAX', amount: 1500 },
        { code: 'SOCIAL_SECURITY', amount: 620 },
        { code: 'MEDICARE', amount: 145 },
        { code: 'STATE_TAX', amount: 500 },
      ]),
    );
    const svc = makeService({ payslipRepo });
    const boxes = await svc.computeW2Boxes('t1', 'emp-1', 2025);

    expect(boxes.box1).toBe(30000);   // 3 × 10000
    expect(boxes.box2).toBe(4500);    // 3 × 1500
    expect(boxes.box4).toBe(1860);    // 3 × 620
    expect(boxes.box6).toBe(435);     // 3 × 145
    expect(boxes.box17).toBe(1500);   // 3 × 500
  });

  it('caps social-security wages at the annual wage base', async () => {
    const payslipRepo = mockRepo();
    payslipRepo.find.mockResolvedValue(yearPayslips(100000)); // 300k gross
    const svc = makeService({ payslipRepo });
    const boxes = await svc.computeW2Boxes('t1', 'emp-1', 2025);

    expect(boxes.box3).toBe(US_TAX_2025.ssWageBase);
    expect(boxes.box5).toBe(300000); // medicare wages uncapped
  });

  it('falls back to statutory rates when withholding not itemised', async () => {
    const payslipRepo = mockRepo();
    payslipRepo.find.mockResolvedValue(yearPayslips(5000)); // 15k gross, no deductions
    const svc = makeService({ payslipRepo });
    const boxes = await svc.computeW2Boxes('t1', 'emp-1', 2025);

    expect(boxes.box4).toBe(930);  // 15000 × 6.2%
    expect(boxes.box6).toBe(217.5); // 15000 × 1.45%
  });
});

// ─── generateW2 ─────────────────────────────────────────────────────────────

describe('StatutoryFormsService.generateW2', () => {
  it('throws NotFoundException when employee missing', async () => {
    const svc = makeService();
    await expect(svc.generateW2('t1', 'emp-x', 2025)).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when no earnings', async () => {
    const employeeRepo = mockRepo();
    employeeRepo.findOne.mockResolvedValue({ ...employee });
    const payslipRepo = mockRepo();
    payslipRepo.find.mockResolvedValue([]); // no payslips → box1 = 0
    const svc = makeService({ employeeRepo, payslipRepo });
    await expect(svc.generateW2('t1', 'emp-1', 2025)).rejects.toThrow(BadRequestException);
  });

  it('saves a W-2 form with computed boxes', async () => {
    const employeeRepo = mockRepo();
    employeeRepo.findOne.mockResolvedValue({ ...employee });
    const payslipRepo = mockRepo();
    payslipRepo.find.mockResolvedValue(yearPayslips(8000, [{ code: 'FED_TAX', amount: 1000 }]));
    const formRepo = mockRepo();
    formRepo.find.mockResolvedValue([]);
    formRepo.create.mockImplementation((x: any) => x);
    formRepo.save.mockImplementation(async (x: any) => ({ ...x, id: 'w2-1' }));
    const svc = makeService({ employeeRepo, payslipRepo, formRepo });

    const result = await svc.generateW2('t1', 'emp-1', 2025, { employerEin: '12-3456789' }, 'user-1');
    expect(result.formType).toBe(StatutoryFormType.W2);
    expect(result.recipientName).toBe('Jane Doe');
    expect(result.data.box1).toBe(24000);
    expect(result.totalAmount).toBe(24000);
  });

  it('supersedes a prior generated W-2 before saving', async () => {
    const employeeRepo = mockRepo();
    employeeRepo.findOne.mockResolvedValue({ ...employee });
    const payslipRepo = mockRepo();
    payslipRepo.find.mockResolvedValue(yearPayslips(8000));
    const formRepo = mockRepo();
    formRepo.find.mockResolvedValue([{ id: 'old', status: StatutoryFormStatus.GENERATED }]);
    formRepo.create.mockImplementation((x: any) => x);
    formRepo.save.mockImplementation(async (x: any) => x);
    const svc = makeService({ employeeRepo, payslipRepo, formRepo });

    await svc.generateW2('t1', 'emp-1', 2025);
    expect(formRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: StatutoryFormStatus.SUPERSEDED }),
    );
  });
});

// ─── 1099-NEC ───────────────────────────────────────────────────────────────

describe('StatutoryFormsService.generate1099Nec', () => {
  it('throws BadRequestException when compensation is zero', async () => {
    const svc = makeService();
    await expect(
      svc.generate1099Nec('t1', 2025, { nonemployeeCompensation: 0 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('saves a 1099-NEC with box1 and box4', async () => {
    const formRepo = mockRepo();
    formRepo.find.mockResolvedValue([]);
    formRepo.create.mockImplementation((x: any) => x);
    formRepo.save.mockImplementation(async (x: any) => ({ ...x, id: 'f-1' }));
    const svc = makeService({ formRepo });

    const result = await svc.generate1099Nec('t1', 2025, {
      nonemployeeCompensation: 25000,
      federalTaxWithheld: 2000,
      recipientName: 'Acme LLC',
      recipientTin: '98-7654321',
    });
    expect(result.formType).toBe(StatutoryFormType.FORM_1099_NEC);
    expect(result.data.box1).toBe(25000);
    expect(result.data.box4).toBe(2000);
    expect(result.recipientName).toBe('Acme LLC');
  });
});

// ─── W-3 ────────────────────────────────────────────────────────────────────

describe('StatutoryFormsService.generateW3', () => {
  it('throws BadRequestException when no W-2s exist', async () => {
    const formRepo = mockRepo();
    formRepo.find.mockResolvedValue([]);
    const svc = makeService({ formRepo });
    await expect(svc.generateW3('t1', 2025)).rejects.toThrow(BadRequestException);
  });

  it('sums box figures across all W-2s', async () => {
    const formRepo = mockRepo();
    formRepo.find
      .mockResolvedValueOnce([
        { data: { box1: 10000, box2: 1000, box4: 620 } },
        { data: { box1: 20000, box2: 2500, box4: 1240 } },
      ]) // W-2 lookup
      .mockResolvedValue([]); // supersede lookup
    formRepo.create.mockImplementation((x: any) => x);
    formRepo.save.mockImplementation(async (x: any) => x);
    const svc = makeService({ formRepo });

    const result = await svc.generateW3('t1', 2025);
    expect(result.data.box1).toBe(30000);
    expect(result.data.box2).toBe(3500);
    expect(result.data.box4).toBe(1860);
    expect(result.data.numberOfW2).toBe(2);
  });
});

// ─── EFW2 ───────────────────────────────────────────────────────────────────

describe('StatutoryFormsService.generateEfw2', () => {
  it('produces RA/RE/RW/RT/RF records each 512 chars', async () => {
    const formRepo = mockRepo();
    formRepo.find
      .mockResolvedValueOnce([
        { recipientName: 'Jane Doe', recipientTaxId: '111-22-3333', data: { box1: 30000, box2: 4000, box3: 30000, box4: 1860, box5: 30000, box6: 435 } },
        { recipientName: 'John Roe', recipientTaxId: '444-55-6666', data: { box1: 50000, box2: 7000, box3: 50000, box4: 3100, box5: 50000, box6: 725 } },
      ]) // W-2 lookup
      .mockResolvedValue([]); // supersede lookup
    formRepo.create.mockImplementation((x: any) => x);
    formRepo.save.mockImplementation(async (x: any) => x);
    const svc = makeService({ formRepo });

    const result = await svc.generateEfw2('t1', 2025, { employerEin: '12-3456789', employerName: 'ACME' });
    const lines = (result.content ?? '').split('\r\n');
    expect(lines[0].slice(0, 2)).toBe('RA');
    expect(lines[1].slice(0, 2)).toBe('RE');
    expect(lines.filter((l) => l.startsWith('RW'))).toHaveLength(2);
    expect(lines.some((l) => l.startsWith('RT'))).toBe(true);
    expect(lines.at(-1)!.startsWith('RF')).toBe(true);
    for (const l of lines) expect(l.length).toBe(512);
  });

  it('throws when no W-2s exist', async () => {
    const formRepo = mockRepo();
    formRepo.find.mockResolvedValue([]);
    const svc = makeService({ formRepo });
    await expect(svc.generateEfw2('t1', 2025)).rejects.toThrow(BadRequestException);
  });
});

// ─── WPS SIF validation ─────────────────────────────────────────────────────

describe('StatutoryFormsService.validateWpsSif', () => {
  const svc = makeService();
  const validSif = [
    'EDR|123456789012|2026|05|AED|9000.00|2',
    'EER|E001|||||2026|05|30.00|4000.00|0.00|1000.00|500.00|4500.00|AED',
    'EER|E002|||||2026|05|30.00|4000.00|0.00|1000.00|500.00|4500.00|AED',
  ].join('\r\n');

  it('accepts a well-formed SIF', () => {
    const r = svc.validateWpsSif(validSif);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.summary.eerCount).toBe(2);
    expect(r.summary.computedTotal).toBe(9000);
  });

  it('flags mismatched employee count', () => {
    const bad = [
      'EDR|123456789012|2026|05|AED|9000.00|3',
      'EER|E001|||||2026|05|30.00|4000.00|0.00|1000.00|500.00|4500.00|AED',
      'EER|E002|||||2026|05|30.00|4000.00|0.00|1000.00|500.00|4500.00|AED',
    ].join('\r\n');
    const r = svc.validateWpsSif(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('declares 3'))).toBe(true);
  });

  it('flags total mismatch', () => {
    const bad = [
      'EDR|123456789012|2026|05|AED|8000.00|2',
      'EER|E001|||||2026|05|30.00|4000.00|0.00|1000.00|500.00|4500.00|AED',
      'EER|E002|||||2026|05|30.00|4000.00|0.00|1000.00|500.00|4500.00|AED',
    ].join('\r\n');
    const r = svc.validateWpsSif(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('does not match'))).toBe(true);
  });

  it('errors when EDR missing', () => {
    const r = svc.validateWpsSif('EER|E001|||||2026|05|30.00|4000.00|0.00|1000.00|500.00|4500.00|AED');
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('EDR'))).toBe(true);
  });

  it('errors on empty content', () => {
    const r = svc.validateWpsSif('');
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('File is empty');
  });
});

// ─── EOSB ───────────────────────────────────────────────────────────────────

describe('StatutoryFormsService.calculateEosb', () => {
  const svc = makeService();

  it('returns zero below one year of service', () => {
    expect(svc.calculateEosb(10000, 0.5)).toBe(0);
  });

  it('uses 21 days per year for the first five years', () => {
    // 3 years × 21 days × (10000/30) = 21000
    expect(svc.calculateEosb(10000, 3)).toBe(21000);
  });

  it('uses 30 days per year beyond five years', () => {
    // first 5: 5×21=105 days, next 2: 2×30=60 days → 165 days × (10000/30) = 55000
    expect(svc.calculateEosb(10000, 7)).toBe(55000);
  });

  it('caps the benefit at two years total wage', () => {
    // very long service would exceed cap of 24 × basic
    expect(svc.calculateEosb(10000, 50)).toBe(240000);
  });
});

describe('StatutoryFormsService EOSB lifecycle', () => {
  it('createEosbSettlement computes years and amount', async () => {
    const employeeRepo = mockRepo();
    employeeRepo.findOne.mockResolvedValue({ ...employee });
    const eosbRepo = mockRepo();
    eosbRepo.create.mockImplementation((x: any) => x);
    eosbRepo.save.mockImplementation(async (x: any) => ({ ...x, id: 'e-1' }));
    const svc = makeService({ employeeRepo, eosbRepo });

    const result = await svc.createEosbSettlement('t1', {
      employeeId: 'emp-1',
      lastDrawnBasic: 10000,
      joinDate: '2020-01-01',
      separationDate: '2023-01-01',
      terminationType: EosbTerminationType.RESIGNATION,
    });
    expect(result.yearsOfService).toBeCloseTo(3, 0);
    expect(result.eosbAmount).toBeGreaterThan(0);
    expect(result.status).toBe(EosbSettlementStatus.PENDING);
  });

  it('createEosbSettlement rejects separation before join', async () => {
    const svc = makeService();
    await expect(
      svc.createEosbSettlement('t1', {
        employeeId: 'emp-1', lastDrawnBasic: 10000,
        joinDate: '2023-01-01', separationDate: '2020-01-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('approve → pay transitions enforce status', async () => {
    const eosbRepo = mockRepo();
    const settlement = { id: 'e-1', tenantId: 't1', status: EosbSettlementStatus.PENDING };
    eosbRepo.findOne.mockResolvedValue(settlement);
    eosbRepo.save.mockImplementation(async (x: any) => x);
    const svc = makeService({ eosbRepo });

    const approved = await svc.approveEosbSettlement('t1', 'e-1', 'mgr-1');
    expect(approved.status).toBe(EosbSettlementStatus.APPROVED);
    expect(approved.approvedById).toBe('mgr-1');

    const paid = await svc.markEosbPaid('t1', 'e-1');
    expect(paid.status).toBe(EosbSettlementStatus.PAID);
  });

  it('markEosbPaid rejects non-approved settlements', async () => {
    const eosbRepo = mockRepo();
    eosbRepo.findOne.mockResolvedValue({ id: 'e-1', tenantId: 't1', status: EosbSettlementStatus.PENDING });
    const svc = makeService({ eosbRepo });
    await expect(svc.markEosbPaid('t1', 'e-1')).rejects.toThrow(BadRequestException);
  });

  it('approveEosbSettlement throws NotFound for missing record', async () => {
    const svc = makeService();
    await expect(svc.approveEosbSettlement('t1', 'nope', 'mgr')).rejects.toThrow(NotFoundException);
  });
});
