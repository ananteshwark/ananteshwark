import { CopilotService } from './copilot.service';

describe('CopilotService — planner', () => {
  const copilot = new CopilotService();

  it('plans recognition from "recognize NAME for MESSAGE"', () => {
    const plan = copilot.plan('Recognize Asha Rao for closing the audit two weeks early');
    expect(plan).toEqual({
      action: 'give_recognition',
      params: { name: 'Asha Rao', message: 'closing the audit two weeks early' },
    });
  });

  it('plans an HR case and forces GRIEVANCE for complaints', () => {
    expect(copilot.plan('Raise an HR case about my March payslip missing')).toEqual({
      action: 'raise_hr_case',
      params: { subject: 'my March payslip missing', category: 'OTHER' },
    });
    expect(copilot.plan('file a grievance about my manager')!.params.category).toBe('GRIEVANCE');
  });

  it('plans queries with dataset aliases and optional dimension', () => {
    expect(copilot.plan('show expenses by status')).toEqual({
      action: 'run_query', params: { dataset: 'expenses', dimension: 'status' },
    });
    expect(copilot.plan('How many tickets')!.params).toEqual({ dataset: 'tickets', dimension: null });
    expect(copilot.plan('show me sales orders by month')!.params.dataset).toBe('sales_orders');
  });

  it('plans anomaly scans, with and without a module filter', () => {
    expect(copilot.plan('Any anomalies this week?')).toEqual({
      action: 'find_anomalies', params: { module: null },
    });
    expect(copilot.plan('show anomalies in finance')!.params.module).toBe('finance');
    expect(copilot.plan('find outliers in payroll')!.params.module).toBe('payroll');
  });

  it('plans a knowledge-base search from "how do I ..." and explicit searches', () => {
    expect(copilot.plan('How do I reset my payroll password?')).toEqual({
      action: 'search_knowledge', params: { query: 'reset my payroll password' },
    });
    expect(copilot.plan('search the knowledge base for leave carryover')!.params.query).toBe('leave carryover');
    expect(copilot.plan('kb article about expense limits')!.params.query).toBe('expense limits');
  });

  it('plans sentiment analysis from quoted text', () => {
    expect(copilot.plan('analyze the sentiment of "the team feels burned out"')).toEqual({
      action: 'survey_sentiment', params: { text: 'the team feels burned out' },
    });
    expect(copilot.plan("what's the sentiment of great supportive culture")!.action).toBe('survey_sentiment');
  });

  it('returns null (→ graceful fallback) for anything else', () => {
    expect(copilot.plan('what is the meaning of life')).toBeNull();
  });
});

describe('CopilotService — execution', () => {
  const user = { id: 'u1', name: 'Priya Admin' };

  it('raises a real HR case through the helpdesk service', async () => {
    const helpdesk: any = {
      createCase: jest.fn().mockResolvedValue({ id: 'c1', caseNumber: 'HRC-000009', subject: 'payslip missing' }),
    };
    const copilot = new CopilotService(undefined, helpdesk);
    const result = await copilot.execute('t1', user, 'raise an hr case about payslip missing');
    expect(result.understood).toBe(true);
    expect(helpdesk.createCase).toHaveBeenCalledWith('t1', 'u1', expect.objectContaining({
      subject: 'payslip missing', category: 'OTHER',
    }));
    expect(result.message).toContain('HRC-000009');
  });

  it('gives recognition end-to-end: employee lookup, first active badge, wall post', async () => {
    const employeeRepo: any = {
      findOne: jest.fn().mockResolvedValue({ id: 'e7', firstName: 'Asha', lastName: 'Rao' }),
    };
    const recognition: any = {
      listBadges: jest.fn().mockResolvedValue([{ id: 'b1', name: 'Team Player' }]),
      give: jest.fn().mockResolvedValue({ id: 'r1', badgeName: 'Team Player' }),
    };
    const copilot = new CopilotService(employeeRepo, undefined, recognition);
    const result = await copilot.execute('t1', user, 'kudos to Asha Rao for the audit');
    expect(recognition.give).toHaveBeenCalledWith('t1', { userId: 'u1', name: 'Priya Admin' }, expect.objectContaining({
      badgeId: 'b1', toEmployeeId: 'e7', toName: 'Asha Rao', message: 'the audit',
    }));
    expect(result.message).toContain('Asha Rao');
  });

  it('asks for a better name when the employee lookup misses', async () => {
    const employeeRepo: any = { findOne: jest.fn().mockResolvedValue(null) };
    const recognition: any = { listBadges: jest.fn(), give: jest.fn() };
    const copilot = new CopilotService(employeeRepo, undefined, recognition);
    const result = await copilot.execute('t1', user, 'recognize Zorblax for vibes');
    expect(result.understood).toBe(true);
    expect(result.message).toContain('Zorblax');
    expect(recognition.give).not.toHaveBeenCalled();
  });

  it('runs semantic queries and narrates totals', async () => {
    const semantic: any = {
      listDatasets: jest.fn().mockReturnValue([
        { key: 'expenses', label: 'Expense claims', hasDateColumn: true, dimensions: [{ key: 'status' }], measures: [] },
      ]),
      run: jest.fn().mockResolvedValue({ rows: [{ count: '42' }] }),
    };
    const copilot = new CopilotService(undefined, undefined, undefined, semantic);
    const result = await copilot.execute('t1', user, 'how many expenses');
    expect(semantic.run).toHaveBeenCalledWith('t1', { dataset: 'expenses', dimensions: [], measures: ['count'] });
    expect(result.message).toContain('42');
  });

  it('narrates anomaly scan results with counts and top findings', async () => {
    const anomalies: any = {
      scan: jest.fn().mockResolvedValue({
        findings: [
          { module: 'finance', check: 'JOURNAL_DUPLICATE_REFERENCE', severity: 'HIGH', title: 'Duplicate reference JE-9' },
          { module: 'expenses', check: 'AMOUNT_OUTLIER', severity: 'MEDIUM', title: 'Claim EXP-BIG is 9x baseline' },
        ],
        summary: { finance: 1, expenses: 1 },
      }),
    };
    const copilot = new CopilotService(undefined, undefined, undefined, undefined, anomalies);
    const result = await copilot.execute('t1', user, 'any anomalies this week?');
    expect(anomalies.scan).toHaveBeenCalledWith('t1', undefined);
    expect(result.message).toContain('2 anomalies');
    expect(result.message).toContain('1 high severity');
    expect(result.message).toContain('Duplicate reference JE-9');

    await copilot.execute('t1', user, 'show anomalies in finance');
    expect(anomalies.scan).toHaveBeenLastCalledWith('t1', ['finance']);
  });

  it('reports a clean bill of health when the scan finds nothing', async () => {
    const anomalies: any = { scan: jest.fn().mockResolvedValue({ findings: [], summary: {} }) };
    const copilot = new CopilotService(undefined, undefined, undefined, undefined, anomalies);
    const result = await copilot.execute('t1', user, 'any anomalies?');
    expect(result.understood).toBe(true);
    expect(result.result).toEqual({ totalFindings: 0 });
    expect(result.message).toContain('no anomalies');
  });

  it('degrades gracefully when a target module is not wired', async () => {
    const copilot = new CopilotService(); // nothing injected
    const result = await copilot.execute('t1', user, 'raise a ticket about wifi');
    expect(result.understood).toBe(true);
    expect(result.message).toContain('not available');
  });

  it('searches the knowledge base and narrates top matches', async () => {
    const knowledge: any = {
      search: jest.fn().mockResolvedValue([
        { article: { id: 'a1', title: 'Reset your password' }, score: 8 },
        { article: { id: 'a2', title: 'Payroll FAQ' }, score: 3 },
      ]),
    };
    // knowledge is the 7th constructor param.
    const copilot = new CopilotService(undefined, undefined, undefined, undefined, undefined, undefined, knowledge);
    const result = await copilot.execute('t1', user, 'how do I reset my password');
    expect(knowledge.search).toHaveBeenCalledWith('t1', 'reset my password', 5);
    expect(result.understood).toBe(true);
    expect(result.message).toContain('Reset your password');
  });

  it('scores sentiment through the survey service', async () => {
    // survey is the 8th constructor param; scoreSentiment is a static, so a truthy stub suffices to wire it.
    const copilot = new CopilotService(undefined, undefined, undefined, undefined, undefined, undefined, undefined, {} as any);
    const result = await copilot.execute('t1', user, 'analyze the sentiment of "toxic and stressful and underpaid"');
    expect(result.understood).toBe(true);
    expect(result.message).toContain('negative');
  });

  it('unknown commands return the capability examples', async () => {
    const copilot = new CopilotService();
    const result = await copilot.execute('t1', user, 'sing me a song');
    expect(result.understood).toBe(false);
    expect(result.message).toContain('Recognize Asha Rao');
  });
});
