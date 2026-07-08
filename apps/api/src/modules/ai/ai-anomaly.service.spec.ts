import { AiAnomalyService } from './ai-anomaly.service';
import { groupOutliers, duplicateGroups, spikeRatio } from './anomaly-stats';

const mockRepo = (rows: any[] = []) => ({ find: jest.fn().mockResolvedValue(rows) });

describe('anomaly-stats primitives', () => {
  it('finds per-group outliers only in groups with enough history', () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => ({ who: 'a', amount: 100 + i })),
      { who: 'a', amount: 5000 },                    // clear outlier
      { who: 'b', amount: 99999 }, { who: 'b', amount: 1 }, // only 2 samples → skipped
    ];
    const hits = groupOutliers(items, (i) => i.who, (i) => i.amount);
    expect(hits).toHaveLength(1);
    expect(hits[0].value).toBe(5000);
    expect(hits[0].z).toBeGreaterThan(3);
  });

  it('clusters exact duplicates and computes spike ratios', () => {
    const dupes = duplicateGroups(
      [{ k: 'x' }, { k: 'x' }, { k: 'y' }],
      (i) => i.k,
    );
    expect(dupes).toHaveLength(1);
    expect(spikeRatio(14, 7, 28, 28)).toBe(2);        // 2/day vs 1/day
    expect(spikeRatio(7, 7, 0, 28)).toBe(Infinity);   // silent baseline
    expect(spikeRatio(0, 7, 28, 28)).toBe(0);
  });
});

describe('AiAnomalyService — per-module detectors', () => {
  const baselineClaims = Array.from({ length: 10 }, (_, i) => ({
    id: `c${i}`, claimNumber: `EXP-${i}`, employeeId: 'e1', totalAmount: 100 + i, claimDate: `2026-06-${String(i + 1).padStart(2, '0')}`,
  }));

  it('expenses: flags outliers and duplicate claims', async () => {
    const claims = [
      ...baselineClaims,
      { id: 'big', claimNumber: 'EXP-BIG', employeeId: 'e1', totalAmount: 9000, claimDate: '2026-06-20' },
      { id: 'd1', claimNumber: 'EXP-D1', employeeId: 'e2', totalAmount: 500, claimDate: '2026-06-21' },
      { id: 'd2', claimNumber: 'EXP-D2', employeeId: 'e2', totalAmount: 500, claimDate: '2026-06-21' },
    ];
    const service = new AiAnomalyService(mockRepo(claims) as any);
    const { findings, summary } = await service.scan('t1', ['expenses']);
    const checks = findings.map((f) => f.check);
    expect(checks).toContain('AMOUNT_OUTLIER');
    expect(checks).toContain('DUPLICATE_CLAIM');
    const dupe = findings.find((f) => f.check === 'DUPLICATE_CLAIM')!;
    expect(dupe.severity).toBe('HIGH');
    expect(dupe.title).toContain('EXP-D1');
    expect(summary.expenses).toBe(findings.length);
  });

  it('procurement: same-day PO clusters and duplicate vendor invoice refs', async () => {
    const pos = [
      { id: 'p1', vendorId: 'v1', vendorName: 'Acme Steel', poNumber: 'PO-1', total: 900, poDate: '2026-06-10' },
      { id: 'p2', vendorId: 'v1', vendorName: 'Acme Steel', poNumber: 'PO-2', total: 900, poDate: '2026-06-10' },
      { id: 'p3', vendorId: 'v1', vendorName: 'Acme Steel', poNumber: 'PO-3', total: 900, poDate: '2026-06-10' },
    ];
    const vendorInvoices = [
      { id: 'i1', vendorId: 'v1', vendorInvoiceRef: 'INV-777' },
      { id: 'i2', vendorId: 'v1', vendorInvoiceRef: ' inv-777 ' }, // case/space-insensitive match
      { id: 'i3', vendorId: 'v2', vendorInvoiceRef: 'INV-777' },   // other vendor → fine
    ];
    const service = new AiAnomalyService(
      undefined, mockRepo(pos) as any, mockRepo(vendorInvoices) as any,
    );
    const { findings } = await service.scan('t1', ['procurement']);
    expect(findings.find((f) => f.check === 'SAME_DAY_PO_CLUSTER')!.detail).toContain('2700');
    const dupes = findings.filter((f) => f.check === 'DUPLICATE_VENDOR_INVOICE');
    expect(dupes).toHaveLength(1);
    expect(dupes[0].severity).toBe('HIGH');
  });

  it('payroll: flags month-over-month net pay swings beyond 30%', async () => {
    const payslips = [
      { id: 's1', employeeId: 'e1', employeeName: 'Asha', netPay: 1000, payPeriodMonth: 4, payPeriodYear: 2026 },
      { id: 's2', employeeId: 'e1', employeeName: 'Asha', netPay: 1600, payPeriodMonth: 5, payPeriodYear: 2026 }, // +60% HIGH
      { id: 's3', employeeId: 'e2', employeeName: 'Ben', netPay: 1000, payPeriodMonth: 4, payPeriodYear: 2026 },
      { id: 's4', employeeId: 'e2', employeeName: 'Ben', netPay: 1050, payPeriodMonth: 5, payPeriodYear: 2026 }, // +5% fine
    ];
    const service = new AiAnomalyService(
      undefined, undefined, undefined, undefined, undefined, mockRepo(payslips) as any,
    );
    const { findings } = await service.scan('t1', ['payroll']);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ check: 'NET_PAY_SWING', severity: 'HIGH', subjectId: 's2' });
    expect(findings[0].title).toContain('60%');
  });

  it('crm: detects a ticket volume spike vs the 4-week baseline', async () => {
    const now = Date.now();
    const tickets = [
      ...Array.from({ length: 14 }, (_, i) => ({ id: `r${i}`, createdAt: new Date(now - (i % 7) * 86_400_000) })),
      ...Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, createdAt: new Date(now - (10 + i) * 86_400_000) })),
    ];
    const service = new AiAnomalyService(
      undefined, undefined, undefined, undefined, undefined, undefined, mockRepo(tickets) as any,
    );
    const { findings } = await service.scan('t1', ['crm']);
    expect(findings).toHaveLength(1);
    expect(findings[0].check).toBe('TICKET_VOLUME_SPIKE');
  });

  it('finance: folds journal anomalies into the unified feed', async () => {
    const journalAnomalies: any = {
      scan: jest.fn().mockResolvedValue({
        anomalies: [{ check: 'DUPLICATE_REFERENCE', severity: 'HIGH', entryId: 'j1', entryNumber: 'JE-9', date: '2026-06-01', detail: 'dupe' }],
      }),
    };
    const service = new AiAnomalyService(
      undefined, undefined, undefined, undefined, mockRepo([]) as any, undefined, undefined, journalAnomalies,
    );
    const { findings } = await service.scan('t1', ['finance']);
    expect(findings[0]).toMatchObject({ module: 'finance', check: 'JOURNAL_DUPLICATE_REFERENCE', severity: 'HIGH' });
  });

  it('scanAndNotify emits anomaly.detected only when findings exist', async () => {
    const automation = { emit: jest.fn().mockResolvedValue(undefined) };
    const dupeClaims = [
      { id: 'd1', claimNumber: 'EXP-D1', employeeId: 'e2', totalAmount: 500, claimDate: '2026-06-21' },
      { id: 'd2', claimNumber: 'EXP-D2', employeeId: 'e2', totalAmount: 500, claimDate: '2026-06-21' },
    ];
    const service = new AiAnomalyService(
      mockRepo(dupeClaims) as any, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      automation as any,
    );
    const result = await service.scanAndNotify('t1');
    expect(result.findings.length).toBeGreaterThan(0);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'anomaly.detected', expect.objectContaining({
      totalFindings: result.findings.length,
      highSeverity: expect.any(Number),
      topFindings: expect.arrayContaining([expect.stringContaining('EXP-D1')]),
    }));

    automation.emit.mockClear();
    const quiet = new AiAnomalyService(
      mockRepo([]) as any, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      automation as any,
    );
    await quiet.scanAndNotify('t1');
    expect(automation.emit).not.toHaveBeenCalled();
  });

  it('registers a durable job handler and schedules scans through the queue', async () => {
    const handlers: Record<string, (payload: any) => Promise<void>> = {};
    const jobs = {
      registerHandler: jest.fn((type: string, fn: any) => { handlers[type] = fn; }),
      enqueue: jest.fn().mockResolvedValue({ id: 'job-1', type: 'ai-anomaly-scan' }),
    };
    const service = new AiAnomalyService(
      mockRepo([]) as any, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, jobs as any,
    );
    expect(jobs.registerHandler).toHaveBeenCalledWith('ai-anomaly-scan', expect.any(Function));

    const job = await service.scheduleScan('t1');
    expect(job.id).toBe('job-1');
    expect(jobs.enqueue).toHaveBeenCalledWith('ai-anomaly-scan', { tenantId: 't1' }, { tenantId: 't1', runAt: undefined });

    const scanSpy = jest.spyOn(service, 'scanAndNotify').mockResolvedValue({} as any);
    await handlers['ai-anomaly-scan']({ tenantId: 't9' });
    expect(scanSpy).toHaveBeenCalledWith('t9');
    await handlers['ai-anomaly-scan']({});          // no tenant → no scan
    expect(scanSpy).toHaveBeenCalledTimes(1);
  });

  it('scheduleScan fails loudly when the jobs queue is not wired', async () => {
    const service = new AiAnomalyService(mockRepo([]) as any);
    await expect(service.scheduleScan('t1')).rejects.toThrow('Durable jobs');
  });

  it('a failing detector never breaks the scan; coverage reflects wiring', async () => {
    const broken = { find: jest.fn().mockRejectedValue(new Error('db down')) };
    const service = new AiAnomalyService(broken as any);
    const result = await service.scan('t1');
    expect(result.findings).toEqual([]);
    expect(result.coverage.find((c) => c.module === 'expenses')!.available).toBe(true);
    expect(result.coverage.find((c) => c.module === 'sales')!.available).toBe(false);
  });
});
