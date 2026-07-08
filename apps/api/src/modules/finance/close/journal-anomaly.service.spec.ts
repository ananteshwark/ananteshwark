import { JournalAnomalyService } from './journal-anomaly.service';

const mockRepo = () => ({ find: jest.fn().mockResolvedValue([]) });

const entry = (over: any) => ({
  id: over.id, tenantId: 't1', entryNumber: over.entryNumber ?? over.id,
  date: over.date ?? '2026-06-10', status: 'POSTED', source: over.source ?? 'MANUAL',
  totalDebit: over.totalDebit ?? 100, totalCredit: over.totalDebit ?? 100,
  reference: over.reference ?? null,
});

describe('JournalAnomalyService', () => {
  let service: JournalAnomalyService;
  let entryRepo: any, lineRepo: any;

  beforeEach(() => {
    entryRepo = mockRepo();
    lineRepo = mockRepo();
    service = new JournalAnomalyService(entryRepo, lineRepo);
  });

  it('flags duplicate reference+amount pairs as HIGH', async () => {
    entryRepo.find.mockResolvedValue([
      entry({ id: 'j1', entryNumber: 'JE-1', reference: 'INV-9', totalDebit: 500 }),
      entry({ id: 'j2', entryNumber: 'JE-2', reference: 'INV-9', totalDebit: 500 }),
      entry({ id: 'j3', entryNumber: 'JE-3', reference: 'INV-9', totalDebit: 750 }), // different amount → fine
    ]);
    const result = await service.scan('t1', '2026-06-01', '2026-06-30');
    const dupes = result.anomalies.filter((a) => a.check === 'DUPLICATE_REFERENCE');
    expect(dupes).toHaveLength(1);
    expect(dupes[0]).toMatchObject({ severity: 'HIGH', entryNumber: 'JE-2' });
    expect(dupes[0].detail).toContain('JE-1');
  });

  it('flags weekend manual postings but not system-generated ones', async () => {
    entryRepo.find.mockResolvedValue([
      entry({ id: 'j1', date: '2026-06-13', source: 'MANUAL' }),  // Saturday
      entry({ id: 'j2', date: '2026-06-13', source: 'SYSTEM' }),  // Saturday but system
      entry({ id: 'j3', date: '2026-06-10', source: 'MANUAL' }),  // Wednesday
    ]);
    const result = await service.scan('t1', '2026-06-01', '2026-06-30');
    const weekend = result.anomalies.filter((a) => a.check === 'WEEKEND_POSTING');
    expect(weekend).toHaveLength(1);
    expect(weekend[0].entryId).toBe('j1');
  });

  it('flags large round manual totals as MEDIUM', async () => {
    entryRepo.find.mockResolvedValue([
      entry({ id: 'j1', totalDebit: 50000 }),          // round + large → flag
      entry({ id: 'j2', totalDebit: 50250.5 }),        // not round
      entry({ id: 'j3', totalDebit: 2000 }),           // round but small
      entry({ id: 'j4', totalDebit: 90000, source: 'SYSTEM' }), // system → skip
    ]);
    const result = await service.scan('t1', '2026-06-01', '2026-06-30');
    const round = result.anomalies.filter((a) => a.check === 'ROUND_SUM');
    expect(round).toHaveLength(1);
    expect(round[0].entryId).toBe('j1');
  });

  it('flags per-account amount outliers beyond 3 sigma', async () => {
    entryRepo.find.mockResolvedValue([entry({ id: 'big', entryNumber: 'JE-BIG' })]);
    // Account history: many ~100s plus one 10,000 line on the scanned entry.
    const history = Array.from({ length: 20 }, (_, i) => ({
      journalEntryId: `old-${i}`, accountId: 'acct-1', debit: 95 + (i % 10), credit: 0,
    }));
    lineRepo.find.mockResolvedValue([
      ...history,
      { journalEntryId: 'big', accountId: 'acct-1', debit: 10000, credit: 0 },
    ]);
    const result = await service.scan('t1', '2026-06-01', '2026-06-30');
    const outliers = result.anomalies.filter((a) => a.check === 'AMOUNT_OUTLIER');
    expect(outliers).toHaveLength(1);
    expect(outliers[0]).toMatchObject({ severity: 'HIGH', entryNumber: 'JE-BIG' });
    expect(outliers[0].detail).toContain('σ above');
  });

  it('flags postings to rarely used accounts and summarizes by check', async () => {
    entryRepo.find.mockResolvedValue([entry({ id: 'j1', entryNumber: 'JE-1' })]);
    lineRepo.find.mockResolvedValue([
      { journalEntryId: 'j1', accountId: 'dusty-acct', debit: 10, credit: 0 }, // 1 line ever
    ]);
    const result = await service.scan('t1', '2026-06-01', '2026-06-30');
    expect(result.anomalies.some((a) => a.check === 'RARE_ACCOUNT')).toBe(true);
    expect(result.summary.RARE_ACCOUNT).toBe(1);
    expect(result.entriesScanned).toBe(1);
  });

  it('ignores DRAFT entries and returns clean output when nothing is wrong', async () => {
    entryRepo.find.mockResolvedValue([{ ...entry({ id: 'j1' }), status: 'DRAFT' }]);
    const result = await service.scan('t1', '2026-06-01', '2026-06-30');
    expect(result.entriesScanned).toBe(0);
    expect(result.anomalies).toHaveLength(0);
  });
});
