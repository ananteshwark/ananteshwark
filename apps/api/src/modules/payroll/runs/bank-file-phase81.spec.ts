import { NotFoundException, BadRequestException } from '@nestjs/common';
import { BankFileService } from './bank-file.service';
import { BankFileFormat, BankFileStatus } from './entities/bank-file-run.entity';
import { PayrollRunStatus } from './entities/payroll-run.entity';
import { PayslipStatus } from './entities/payslip.entity';
import { mockRepo } from '../../../test/mock-repo';

function makeService(overrides: Partial<Record<string, any>> = {}): BankFileService {
  return new BankFileService(
    overrides.fileRunRepo ?? mockRepo(),
    overrides.runRepo ?? mockRepo(),
    overrides.payslipRepo ?? mockRepo(),
  );
}

const baseRun = {
  id: 'run-1',
  tenantId: 't1',
  name: 'May 2026',
  status: PayrollRunStatus.APPROVED,
  payPeriodMonth: 5,
  payPeriodYear: 2026,
  payDate: '2026-05-31',
  currency: 'INR',
};

const makePayslips = (n = 2) =>
  Array.from({ length: n }, (_, i) => ({
    id: `ps-${i + 1}`,
    tenantId: 't1',
    payrollRunId: 'run-1',
    employeeId: `emp-${i + 1}`,
    employeeCode: `E00${i + 1}`,
    employeeName: `Employee ${i + 1}`,
    grossEarnings: 50000,
    totalDeductions: 5000,
    netPay: 45000,
    earnings: [{ code: 'BASIC', amount: 40000 }, { code: 'HRA', amount: 10000 }],
    daysWorked: 31,
    status: PayslipStatus.PUBLISHED,
  }));

// ─── listBankFileRuns ─────────────────────────────────────────────────────────

describe('BankFileService.listBankFileRuns', () => {
  it('returns files ordered by generatedAt DESC', async () => {
    const fileRunRepo = mockRepo();
    const files = [{ id: 'f1' }, { id: 'f2' }];
    fileRunRepo.find.mockResolvedValue(files);
    const svc = makeService({ fileRunRepo });

    const result = await svc.listBankFileRuns('t1', 'run-1');
    expect(fileRunRepo.find).toHaveBeenCalledWith({
      where: { tenantId: 't1', payrollRunId: 'run-1' },
      order: { generatedAt: 'DESC' },
    });
    expect(result).toEqual(files);
  });
});

// ─── generateAndSave ──────────────────────────────────────────────────────────

describe('BankFileService.generateAndSave', () => {
  it('throws NotFoundException when run not found', async () => {
    const svc = makeService();
    await expect(svc.generateAndSave('t1', 'run-x', BankFileFormat.NEFT_RTGS, {})).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when run is DRAFT', async () => {
    const runRepo = mockRepo();
    runRepo.findOne.mockResolvedValue({ ...baseRun, status: PayrollRunStatus.DRAFT });
    const svc = makeService({ runRepo });
    await expect(svc.generateAndSave('t1', 'run-1', BankFileFormat.NEFT_RTGS, {})).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when no payslips found', async () => {
    const runRepo = mockRepo();
    runRepo.findOne.mockResolvedValue({ ...baseRun });
    const svc = makeService({ runRepo }); // payslipRepo.find returns [] by default
    await expect(svc.generateAndSave('t1', 'run-1', BankFileFormat.NEFT_RTGS, {})).rejects.toThrow(BadRequestException);
  });

  it('supersedes existing GENERATED files for same run+format', async () => {
    const runRepo = mockRepo();
    runRepo.findOne.mockResolvedValue({ ...baseRun });
    const payslipRepo = mockRepo();
    payslipRepo.find.mockResolvedValue(makePayslips(2));
    const fileRunRepo = mockRepo();
    const existing = [{ id: 'old-1', status: BankFileStatus.GENERATED }];
    fileRunRepo.find
      .mockResolvedValueOnce(existing)  // first find: get existing to supersede
      .mockResolvedValue([]);
    fileRunRepo.create.mockImplementation((x: any) => x);
    fileRunRepo.save.mockImplementation(async (x: any) => x);

    const svc = makeService({ runRepo, payslipRepo, fileRunRepo });
    await svc.generateAndSave('t1', 'run-1', BankFileFormat.NEFT_RTGS, {});

    expect(fileRunRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: BankFileStatus.SUPERSEDED }));
  });

  it('saves a new BankFileRun with correct metadata', async () => {
    const runRepo = mockRepo();
    runRepo.findOne.mockResolvedValue({ ...baseRun });
    const payslipRepo = mockRepo();
    payslipRepo.find.mockResolvedValue(makePayslips(3));
    const fileRunRepo = mockRepo();
    fileRunRepo.find.mockResolvedValue([]);
    fileRunRepo.create.mockImplementation((x: any) => x);
    fileRunRepo.save.mockImplementation(async (x: any) => x);

    const svc = makeService({ runRepo, payslipRepo, fileRunRepo });
    await svc.generateAndSave('t1', 'run-1', BankFileFormat.NEFT_RTGS, {}, 'user-1');

    expect(fileRunRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 't1',
      payrollRunId: 'run-1',
      format: BankFileFormat.NEFT_RTGS,
      employeeCount: 3,
      totalAmount: 135000,
      generatedBy: 'user-1',
    }));
  });

  it('accepts PAID run status', async () => {
    const runRepo = mockRepo();
    runRepo.findOne.mockResolvedValue({ ...baseRun, status: PayrollRunStatus.PAID });
    const payslipRepo = mockRepo();
    payslipRepo.find.mockResolvedValue(makePayslips(1));
    const fileRunRepo = mockRepo();
    fileRunRepo.find.mockResolvedValue([]);
    fileRunRepo.create.mockImplementation((x: any) => x);
    fileRunRepo.save.mockImplementation(async (x: any) => ({ ...x, id: 'new-file' }));

    const svc = makeService({ runRepo, payslipRepo, fileRunRepo });
    const result = await svc.generateAndSave('t1', 'run-1', BankFileFormat.SEPA_XML, {});
    expect(result).toBeDefined();
  });
});

// ─── markPayslipsPaid ─────────────────────────────────────────────────────────

describe('BankFileService.markPayslipsPaid', () => {
  it('marks unpaid payslips as PAID and returns count', async () => {
    const payslipRepo = mockRepo();
    const payslips = [
      { ...makePayslips(1)[0], status: PayslipStatus.PUBLISHED },
      { ...makePayslips(1)[0], id: 'ps-2', status: PayslipStatus.PAID }, // already paid
    ];
    payslipRepo.find.mockResolvedValue(payslips);
    payslipRepo.save.mockImplementation(async (x: any) => x);

    const svc = makeService({ payslipRepo });
    const result = await svc.markPayslipsPaid('t1', 'run-1');

    expect(result.updated).toBe(1);
    expect(payslipRepo.save).toHaveBeenCalledTimes(1);
    expect(payslips[0].status).toBe(PayslipStatus.PAID);
  });

  it('returns 0 when all payslips already paid', async () => {
    const payslipRepo = mockRepo();
    payslipRepo.find.mockResolvedValue(
      makePayslips(2).map(p => ({ ...p, status: PayslipStatus.PAID })),
    );
    const svc = makeService({ payslipRepo });
    const result = await svc.markPayslipsPaid('t1', 'run-1');
    expect(result.updated).toBe(0);
  });
});

// ─── Format builders ──────────────────────────────────────────────────────────

describe('BankFileService format builders', () => {
  const svc = makeService();
  const run = baseRun as any;
  const payslips = makePayslips(2) as any[];

  describe('buildNeftRtgs', () => {
    it('produces H/D/T structure', () => {
      const out = svc.buildNeftRtgs(run, payslips, {});
      const lines = out.split('\r\n');
      expect(lines[0]).toMatch(/^H\|/);
      expect(lines[1]).toMatch(/^D\|/);
      expect(lines[2]).toMatch(/^D\|/);
      expect(lines[3]).toMatch(/^T\|/);
    });

    it('trailer contains correct employee count', () => {
      const out = svc.buildNeftRtgs(run, payslips, {});
      const trailer = out.split('\r\n').at(-1)!;
      expect(trailer).toContain('2|90000.00|INR');
    });

    it('uses custom payment date', () => {
      const out = svc.buildNeftRtgs(run, payslips, { paymentDate: '2026-06-01' });
      expect(out.split('\r\n')[0]).toContain('20260601');
    });
  });

  describe('buildNachaAch', () => {
    it('starts with record type 1 (file header)', () => {
      const out = svc.buildNachaAch(run, payslips, {});
      expect(out.split('\r\n')[0][0]).toBe('1');
    });

    it('contains batch header (5) and batch control (8)', () => {
      const out = svc.buildNachaAch(run, payslips, {});
      const lines = out.split('\r\n');
      expect(lines.some(l => l[0] === '5')).toBe(true);
      expect(lines.some(l => l[0] === '8')).toBe(true);
    });

    it('entry detail lines start with 6', () => {
      const out = svc.buildNachaAch(run, payslips, {});
      const entries = out.split('\r\n').filter(l => l[0] === '6');
      expect(entries).toHaveLength(2);
    });

    it('total line count is a multiple of 10', () => {
      const out = svc.buildNachaAch(run, payslips, {});
      const count = out.split('\r\n').length;
      expect(count % 10).toBe(0);
    });

    it('each record is 94 characters', () => {
      const out = svc.buildNachaAch(run, payslips, {});
      const lines = out.split('\r\n');
      for (const line of lines) {
        expect(line.length).toBe(94);
      }
    });
  });

  describe('buildWpsSif', () => {
    it('starts with EDR line', () => {
      const out = svc.buildWpsSif(run, payslips, { molEmployerId: '1234567890' });
      expect(out.split('\r\n')[0]).toMatch(/^EDR\|/);
    });

    it('has one EER per employee', () => {
      const out = svc.buildWpsSif(run, payslips, {});
      const eers = out.split('\r\n').filter(l => l.startsWith('EER|'));
      expect(eers).toHaveLength(2);
    });

    it('EDR contains correct employee count', () => {
      const out = svc.buildWpsSif(run, payslips, {});
      const edr = out.split('\r\n')[0];
      expect(edr).toContain('|2');
    });
  });

  describe('buildSepaXml', () => {
    it('produces valid XML opening', () => {
      const out = svc.buildSepaXml(run, payslips, {});
      expect(out).toMatch(/^<\?xml/);
      expect(out).toContain('pain.001.001.03');
    });

    it('contains one CdtTrfTxInf per payslip', () => {
      const out = svc.buildSepaXml(run, payslips, {});
      const matches = out.match(/<CdtTrfTxInf>/g);
      expect(matches).toHaveLength(2);
    });

    it('uses SEPA_XML format extension', () => {
      const out = svc.buildSepaXml(run, payslips, { creditorIban: 'DE00TEST000' });
      expect(out).toContain('DE00TEST000');
    });

    it('escapes HTML entities in company name', () => {
      const out = svc.buildSepaXml(run, payslips, { companyName: 'ACME & Co <Ltd>' });
      expect(out).toContain('ACME &amp; Co &lt;Ltd>');
      expect(out).not.toContain('ACME & Co <Ltd>');
    });
  });
});
