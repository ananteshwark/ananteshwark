import { NotFoundException, BadRequestException } from '@nestjs/common';
import { LedgersService } from './ledgers.service';
import { JournalSource } from '../gl/entities/journal-entry.entity';
import { mockRepo } from '../../../test/mock-repo';

function makeService(overrides: Partial<Record<string, any>> = {}): LedgersService {
  const reportsService = overrides.reportsService ?? {
    getTrialBalance: jest.fn(async () => ({ rows: [], totalDebit: 0, totalCredit: 0, balanced: true })),
    getProfitAndLoss: jest.fn(async () => ({})),
    getBalanceSheet: jest.fn(async () => ({})),
  };
  return new LedgersService(
    overrides.ledgerRepo ?? mockRepo(),
    overrides.groupRepo ?? mockRepo(),
    overrides.ruleRepo ?? mockRepo(),
    overrides.journalRepo ?? mockRepo(),
    overrides.periodRepo ?? mockRepo(),
    reportsService as any,
  );
}

// ─── Ledgers ──────────────────────────────────────────────────────────────────

describe('LedgersService ledgers', () => {
  it('createLedger rejects duplicate code', async () => {
    const ledgerRepo = mockRepo();
    ledgerRepo.findOne.mockResolvedValue({ id: 'l1', code: 'MAIN' });
    const svc = makeService({ ledgerRepo });
    await expect(svc.createLedger('t1', { code: 'MAIN', name: 'Main' })).rejects.toThrow(BadRequestException);
  });

  it('createLedger clears prior leading when setting new leading', async () => {
    const ledgerRepo = mockRepo();
    ledgerRepo.findOne.mockResolvedValue(null);
    ledgerRepo.create.mockImplementation((x: any) => x);
    ledgerRepo.save.mockImplementation(async (x: any) => ({ ...x, id: 'l1' }));
    const svc = makeService({ ledgerRepo });

    await svc.createLedger('t1', { code: 'IFRS', name: 'IFRS', isLeading: true });
    expect(ledgerRepo.update).toHaveBeenCalledWith(
      { tenantId: 't1', isLeading: true }, { isLeading: false },
    );
  });

  it('seedDefaultLedgers is idempotent on existing ledgers', async () => {
    const ledgerRepo = mockRepo();
    ledgerRepo.findOne
      .mockResolvedValueOnce({ id: 'm', code: 'MAIN' })       // MAIN exists
      .mockResolvedValueOnce(null)                            // IFRS new
      .mockResolvedValueOnce(null);                           // TAX new
    ledgerRepo.create.mockImplementation((x: any) => x);
    ledgerRepo.save.mockImplementation(async (x: any) => ({ ...x, id: 'new' }));
    const svc = makeService({ ledgerRepo });

    const result = await svc.seedDefaultLedgers('t1');
    expect(result).toHaveLength(3);
    expect(ledgerRepo.save).toHaveBeenCalledTimes(2); // only IFRS + TAX created
  });
});

// ─── Posting rules ──────────────────────────────────────────────────────────────

describe('LedgersService posting rules', () => {
  it('resolveLedgersForSource returns rule ledger codes when configured', async () => {
    const ruleRepo = mockRepo();
    ruleRepo.findOne.mockResolvedValue({ source: JournalSource.FIXED_ASSETS, ledgerCodes: ['MAIN', 'IFRS', 'TAX'], isActive: true });
    const svc = makeService({ ruleRepo });
    const result = await svc.resolveLedgersForSource('t1', JournalSource.FIXED_ASSETS);
    expect(result).toEqual(['MAIN', 'IFRS', 'TAX']);
  });

  it('resolveLedgersForSource falls back to leading ledger', async () => {
    const ruleRepo = mockRepo();
    ruleRepo.findOne.mockResolvedValue(null);
    const ledgerRepo = mockRepo();
    ledgerRepo.findOne.mockResolvedValue({ code: 'MAIN', isLeading: true });
    const svc = makeService({ ruleRepo, ledgerRepo });
    const result = await svc.resolveLedgersForSource('t1', JournalSource.AP);
    expect(result).toEqual(['MAIN']);
  });

  it('resolveLedgersForSource defaults to MAIN when no leading ledger exists', async () => {
    const ruleRepo = mockRepo();
    ruleRepo.findOne.mockResolvedValue(null);
    const ledgerRepo = mockRepo();
    ledgerRepo.findOne.mockResolvedValue(null);
    const svc = makeService({ ruleRepo, ledgerRepo });
    const result = await svc.resolveLedgersForSource('t1', JournalSource.AR);
    expect(result).toEqual(['MAIN']);
  });

  it('upsertPostingRule updates an existing rule in place', async () => {
    const ruleRepo = mockRepo();
    const existing = { id: 'r1', source: JournalSource.PAYROLL, ledgerCodes: ['MAIN'] };
    ruleRepo.findOne.mockResolvedValue(existing);
    ruleRepo.save.mockImplementation(async (x: any) => x);
    const svc = makeService({ ruleRepo });

    const result = await svc.upsertPostingRule('t1', { source: JournalSource.PAYROLL, ledgerCodes: ['MAIN', 'IFRS'] });
    expect(result.ledgerCodes).toEqual(['MAIN', 'IFRS']);
    expect(ruleRepo.create).not.toHaveBeenCalled();
  });
});

// ─── Ledger groups ────────────────────────────────────────────────────────────

describe('LedgersService groups', () => {
  it('createGroup defaults leadingLedger to first member', async () => {
    const groupRepo = mockRepo();
    groupRepo.findOne.mockResolvedValue(null);
    groupRepo.create.mockImplementation((x: any) => x);
    groupRepo.save.mockImplementation(async (x: any) => x);
    const svc = makeService({ groupRepo });

    const result = await svc.createGroup('t1', { code: 'IFRS_GRP', description: 'IFRS + Local', memberLedgers: ['MAIN', 'IFRS'] });
    expect(result.leadingLedger).toBe('MAIN');
  });

  it('getGroup throws NotFound when missing', async () => {
    const svc = makeService();
    await expect(svc.getGroup('t1', 'NOPE')).rejects.toThrow(NotFoundException);
  });
});

// ─── Reconciliation matrix ────────────────────────────────────────────────────

describe('LedgersService.getReconciliationMatrix', () => {
  it('computes per-account differences vs the leading ledger', async () => {
    const groupRepo = mockRepo();
    groupRepo.findOne.mockResolvedValue({
      code: 'G1', memberLedgers: ['MAIN', 'IFRS'], leadingLedger: 'MAIN',
    });
    const reportsService = {
      getTrialBalance: jest.fn()
        .mockResolvedValueOnce({ // MAIN
          rows: [
            { accountId: 'a1', code: '1000', name: 'Cash', debit: 1000, credit: 0 },
            { accountId: 'a2', code: '6000', name: 'Depr', debit: 500, credit: 0 },
          ],
          totalDebit: 1500, totalCredit: 0, balanced: true,
        })
        .mockResolvedValueOnce({ // IFRS — depreciation differs
          rows: [
            { accountId: 'a1', code: '1000', name: 'Cash', debit: 1000, credit: 0 },
            { accountId: 'a2', code: '6000', name: 'Depr', debit: 800, credit: 0 },
          ],
          totalDebit: 1800, totalCredit: 0, balanced: true,
        }),
      getProfitAndLoss: jest.fn(),
      getBalanceSheet: jest.fn(),
    };
    const svc = makeService({ groupRepo, reportsService });

    const result = await svc.getReconciliationMatrix('t1', 'G1', { asOf: '2026-12-31' });
    expect(result.leadingLedger).toBe('MAIN');
    expect(result.ledgers).toEqual(['MAIN', 'IFRS']);

    const cash = result.rows.find((r) => r.code === '1000')!;
    expect(cash.hasDifference).toBe(false);
    expect(cash.differences.IFRS).toBe(0);

    const depr = result.rows.find((r) => r.code === '6000')!;
    expect(depr.hasDifference).toBe(true);
    expect(depr.differences.IFRS).toBe(300); // 800 - 500

    expect(result.differenceTotals.IFRS).toBe(300);
    expect(result.inBalance).toBe(false);
  });

  it('throws when group has no member ledgers', async () => {
    const groupRepo = mockRepo();
    groupRepo.findOne.mockResolvedValue({ code: 'EMPTY', memberLedgers: [], leadingLedger: null });
    const svc = makeService({ groupRepo });
    await expect(svc.getReconciliationMatrix('t1', 'EMPTY', {})).rejects.toThrow(BadRequestException);
  });
});

// ─── Group close cockpit ──────────────────────────────────────────────────────

describe('LedgersService.getGroupCloseCockpit', () => {
  it('reports per-ledger close readiness', async () => {
    const groupRepo = mockRepo();
    groupRepo.findOne.mockResolvedValue({ code: 'G1', memberLedgers: ['MAIN', 'IFRS'], leadingLedger: 'MAIN' });
    const periodRepo = mockRepo();
    periodRepo.findOne.mockResolvedValue({ id: 'p1', status: 'OPEN' });
    const journalRepo = mockRepo();
    journalRepo.count
      .mockResolvedValueOnce(0)  // MAIN drafts
      .mockResolvedValueOnce(2); // IFRS drafts
    const reportsService = {
      getTrialBalance: jest.fn()
        .mockResolvedValueOnce({ rows: [], totalDebit: 100, totalCredit: 100, balanced: true }) // MAIN balanced
        .mockResolvedValueOnce({ rows: [], totalDebit: 100, totalCredit: 100, balanced: true }), // IFRS balanced
      getProfitAndLoss: jest.fn(),
      getBalanceSheet: jest.fn(),
    };
    const svc = makeService({ groupRepo, periodRepo, journalRepo, reportsService });

    const result = await svc.getGroupCloseCockpit('t1', 'G1', 'p1');
    expect(result.ledgers).toHaveLength(2);
    expect(result.ledgers[0].canClose).toBe(true);  // MAIN: 0 drafts, balanced
    expect(result.ledgers[1].canClose).toBe(false); // IFRS: 2 drafts
    expect(result.canCloseAll).toBe(false);
  });

  it('throws NotFound for missing period', async () => {
    const groupRepo = mockRepo();
    groupRepo.findOne.mockResolvedValue({ code: 'G1', memberLedgers: ['MAIN'] });
    const periodRepo = mockRepo();
    periodRepo.findOne.mockResolvedValue(null);
    const svc = makeService({ groupRepo, periodRepo });
    await expect(svc.getGroupCloseCockpit('t1', 'G1', 'nope')).rejects.toThrow(NotFoundException);
  });
});
