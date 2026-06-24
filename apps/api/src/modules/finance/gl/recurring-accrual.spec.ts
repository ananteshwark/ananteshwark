import { BadRequestException } from '@nestjs/common';
import { GlService } from './gl.service';
import { RecurringFrequency } from './entities/recurring-journal.entity';
import { AccrualConfigStatus } from './entities/accrual-config.entity';
import { mockRepo, mockDataSource } from '../../../test/mock-repo';

/**
 * Phase 76 — Recurring Journals + Accrual Engine.
 * Exercises the scheduling/posting logic in isolation by stubbing
 * postJournalEntry / reverseJournalEntry on the service instance.
 */
describe('GlService — Phase 76 recurring & accrual', () => {
  let recurringRepo: any, accrualConfigRepo: any, svc: GlService;

  beforeEach(() => {
    recurringRepo = mockRepo();
    accrualConfigRepo = mockRepo();
    svc = new GlService(
      mockRepo(), // account
      mockRepo(), // costCenter
      mockRepo(), // fiscalYear
      mockRepo(), // period
      mockRepo(), // journal
      mockRepo(), // line
      mockRepo(), // splittingRule
      recurringRepo,
      accrualConfigRepo,
      mockDataSource(),
    );
  });

  describe('nextDateForFrequency', () => {
    const next = (d: string, f: RecurringFrequency) => (svc as any).nextDateForFrequency(d, f);

    it('advances weekly by 7 days', () => {
      expect(next('2026-01-01', RecurringFrequency.WEEKLY)).toBe('2026-01-08');
    });
    it('advances monthly by one month', () => {
      expect(next('2026-01-15', RecurringFrequency.MONTHLY)).toBe('2026-02-15');
    });
    it('advances quarterly by three months', () => {
      expect(next('2026-01-15', RecurringFrequency.QUARTERLY)).toBe('2026-04-15');
    });
    it('advances yearly by one year', () => {
      expect(next('2026-01-15', RecurringFrequency.YEARLY)).toBe('2027-01-15');
    });
  });

  describe('runRecurringJournals', () => {
    it('posts due templates and advances their next run date, skipping future ones', async () => {
      const due = {
        id: 'aaaaaaaa-1111', name: 'Rent', isActive: true, frequency: RecurringFrequency.MONTHLY,
        nextRunDate: '2026-06-01', endDate: null, ledgerCode: 'MAIN',
        templateLines: [{ accountId: 'acc1', debit: 100, credit: 0 }, { accountId: 'acc2', debit: 0, credit: 100 }],
      };
      const future = {
        id: 'bbbbbbbb-2222', name: 'Insurance', isActive: true, frequency: RecurringFrequency.MONTHLY,
        nextRunDate: '2026-07-01', endDate: null, templateLines: [],
      };
      recurringRepo.find.mockResolvedValue([due, future]);
      recurringRepo.save.mockImplementation(async (x: any) => x);
      (svc as any).postJournalEntry = jest.fn().mockResolvedValue({ id: 'je1' });

      const res = await svc.runRecurringJournals('t1', '2026-06-24', 'user1');
      expect(res.run).toBe(1);
      expect(res.entries).toEqual(['je1']);
      expect(due.nextRunDate).toBe('2026-07-01'); // advanced one month
      expect((due as any).lastRunDate).toBe('2026-06-01');
    });

    it('skips templates past their end date', async () => {
      const expired = {
        id: 'cccc', name: 'Old', isActive: true, frequency: RecurringFrequency.MONTHLY,
        nextRunDate: '2026-01-01', endDate: '2026-03-01', templateLines: [],
      };
      recurringRepo.find.mockResolvedValue([expired]);
      (svc as any).postJournalEntry = jest.fn();
      const res = await svc.runRecurringJournals('t1', '2026-06-24', 'user1');
      expect(res.run).toBe(0);
      expect((svc as any).postJournalEntry).not.toHaveBeenCalled();
    });
  });

  describe('postAccrual', () => {
    it('posts a balanced accrual and schedules a reversal when autoReverse is set', async () => {
      accrualConfigRepo.findOne.mockResolvedValue({
        id: 'dddddddd-3333', tenantId: 't1', name: 'Bonus', status: AccrualConfigStatus.ACTIVE,
        accrualAccountId: 'exp', offsetAccountId: 'liab', monthlyAmount: 500, autoReverse: true,
      });
      accrualConfigRepo.save.mockImplementation(async (x: any) => x);
      const postSpy = jest.fn().mockResolvedValue({ id: 'je-accrual' });
      const revSpy = jest.fn().mockResolvedValue({ id: 'je-reversal' });
      (svc as any).postJournalEntry = postSpy;
      (svc as any).reverseJournalEntry = revSpy;

      const res = await svc.postAccrual('t1', 'dddddddd-3333', '2026-06', 'user1');
      expect(res).toEqual({ id: 'je-accrual' });
      // balanced lines: one debit 500, one credit 500
      const posted = postSpy.mock.calls[0][1];
      expect(posted.lines).toHaveLength(2);
      expect(posted.lines[0].debit).toBe(500);
      expect(posted.lines[1].credit).toBe(500);
      // reversal scheduled for the first of next month
      expect(revSpy).toHaveBeenCalledWith('t1', 'je-accrual', 'user1', '2026-07-01');
    });

    it('rejects posting against an inactive accrual config', async () => {
      accrualConfigRepo.findOne.mockResolvedValue({
        id: 'd1', tenantId: 't1', status: AccrualConfigStatus.INACTIVE,
      });
      await expect(svc.postAccrual('t1', 'd1', '2026-06')).rejects.toThrow(BadRequestException);
    });
  });
});
