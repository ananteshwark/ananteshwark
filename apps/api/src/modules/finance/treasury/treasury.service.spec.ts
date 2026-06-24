import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TreasuryService } from './treasury.service';
import { BankGuaranteeStatus } from './entities/bank-guarantee.entity';
import { InstrumentStatus } from './entities/financial-instrument.entity';
import { SweepType } from './entities/sweep-rule.entity';
import { mockRepo, mockQueryBuilder, mockDataSource } from '../../../test/mock-repo';

describe('TreasuryService', () => {
  let cashRepo: any, guaranteeRepo: any, instrumentRepo: any, sweepRuleRepo: any,
    sweepLogRepo: any, bankAccountRepo: any, billRepo: any, invoiceRepo: any,
    glService: any, dataSource: any, svc: TreasuryService;

  beforeEach(() => {
    cashRepo = mockRepo();
    guaranteeRepo = mockRepo();
    instrumentRepo = mockRepo();
    sweepRuleRepo = mockRepo();
    sweepLogRepo = mockRepo();
    bankAccountRepo = mockRepo();
    billRepo = mockRepo();
    invoiceRepo = mockRepo();
    glService = { postJournalEntry: jest.fn() };
    dataSource = mockDataSource();
    svc = new TreasuryService(
      cashRepo, guaranteeRepo, instrumentRepo, sweepRuleRepo, sweepLogRepo,
      bankAccountRepo, billRepo, invoiceRepo, glService, dataSource,
    );
  });

  describe('createCashPosition', () => {
    it('computes closing = opening + inflow - outflow', async () => {
      cashRepo.save.mockImplementation(async (x: any) => ({ id: 'cp1', ...x }));
      const res: any = await svc.createCashPosition('t1', {
        openingBalance: 100, inflowForecast: 50, outflowForecast: 30,
      });
      expect(res.closingBalance).toBe(120);
    });

    it('treats missing inflow/outflow as zero', async () => {
      const res: any = await svc.createCashPosition('t1', { openingBalance: 200 });
      expect(res.closingBalance).toBe(200);
    });
  });

  describe('accrueInterest', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-24T00:00:00Z'));
    });
    afterEach(() => jest.useRealTimers());

    it('accrues faceValue * (rate/365) * days and stamps the date', async () => {
      instrumentRepo.findOne.mockResolvedValue({
        id: 'i1', tenantId: 't1', status: InstrumentStatus.ACTIVE,
        faceValue: 100000, interestRate: 0.05, interestAccrued: 0,
        interestAccruedAt: new Date('2026-06-14T00:00:00Z'),
        purchaseDate: '2026-01-01', maturityDate: '2027-01-01',
      });
      instrumentRepo.save.mockImplementation(async (x: any) => x);
      const res: any = await svc.accrueInterest('t1', 'i1');
      // 10 days * 100000 * 0.05/365 = 136.99 (rounded)
      expect(res.interestAccrued).toBeCloseTo(136.99, 2);
      expect(res.interestAccruedAt).toBeInstanceOf(Date);
      expect(res.status).toBe(InstrumentStatus.ACTIVE);
    });

    it('marks instrument MATURED when maturity has passed', async () => {
      instrumentRepo.findOne.mockResolvedValue({
        id: 'i1', tenantId: 't1', status: InstrumentStatus.ACTIVE,
        faceValue: 100000, interestRate: 0.05, interestAccrued: 0,
        interestAccruedAt: new Date('2026-06-14T00:00:00Z'),
        purchaseDate: '2026-01-01', maturityDate: '2026-06-20',
      });
      instrumentRepo.save.mockImplementation(async (x: any) => x);
      const res: any = await svc.accrueInterest('t1', 'i1');
      expect(res.status).toBe(InstrumentStatus.MATURED);
    });

    it('rejects accrual on a non-active instrument', async () => {
      instrumentRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', status: InstrumentStatus.REDEEMED });
      await expect(svc.accrueInterest('t1', 'i1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateGuaranteeStatus', () => {
    it('defaults claimedAmount to full amount and stamps claimedAt', async () => {
      guaranteeRepo.findOne.mockResolvedValue({ id: 'g1', tenantId: 't1', status: BankGuaranteeStatus.ACTIVE, amount: 5000 });
      guaranteeRepo.save.mockImplementation(async (x: any) => x);
      const res: any = await svc.updateGuaranteeStatus('t1', 'g1', { status: BankGuaranteeStatus.CLAIMED });
      expect(res.claimedAmount).toBe(5000);
      expect(res.claimedAt).toBeInstanceOf(Date);
    });

    it('stamps releasedAt on release', async () => {
      guaranteeRepo.findOne.mockResolvedValue({ id: 'g1', tenantId: 't1', status: BankGuaranteeStatus.ACTIVE, amount: 5000 });
      guaranteeRepo.save.mockImplementation(async (x: any) => x);
      const res: any = await svc.updateGuaranteeStatus('t1', 'g1', { status: BankGuaranteeStatus.RELEASED });
      expect(res.releasedAt).toBeInstanceOf(Date);
    });

    it('refuses transition from a non-active guarantee', async () => {
      guaranteeRepo.findOne.mockResolvedValue({ id: 'g1', tenantId: 't1', status: BankGuaranteeStatus.EXPIRED });
      await expect(
        svc.updateGuaranteeStatus('t1', 'g1', { status: BankGuaranteeStatus.RELEASED }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getLiquidityForecast', () => {
    it('nets receivables against payables per day', async () => {
      billRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([
        { dueDate: '2026-07-01', balanceDue: 300 },
      ]));
      invoiceRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([
        { dueDate: '2026-07-01', balanceDue: 1000 },
      ]));
      const res = await svc.getLiquidityForecast('t1', '2026-07-01', '2026-07-31', 'daily');
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({ date: '2026-07-01', payables: 300, receivables: 1000, net: 700 });
    });

    it('buckets to the Monday of the week when weekly', async () => {
      // 2026-07-01 is a Wednesday -> Monday 2026-06-29
      billRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([
        { dueDate: '2026-07-01', balanceDue: 100 },
      ]));
      invoiceRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));
      const res = await svc.getLiquidityForecast('t1', '2026-06-29', '2026-07-05', 'weekly');
      expect(res).toHaveLength(1);
      expect(res[0].date).toBe('2026-06-29');
      expect(res[0].net).toBe(-100);
    });
  });

  describe('executeSweep', () => {
    it('zero-balance sweep transfers the full source balance', async () => {
      sweepRuleRepo.findOne.mockResolvedValue({
        id: 'r1', tenantId: 't1', isActive: true, sweepType: SweepType.ZERO_BALANCE,
        sourceAccountId: 'a1', targetAccountId: 'a2',
      });
      bankAccountRepo.findOne
        .mockResolvedValueOnce({ id: 'a1', currentBalance: 1000, currency: 'USD' })
        .mockResolvedValueOnce({ id: 'a2', currentBalance: 500, currency: 'USD' });
      const res: any = await svc.executeSweep('t1', 'r1');
      expect(res.amountTransferred).toBe(1000);
      expect(res.sourceBalanceAfter).toBe(0);
    });

    it('target-balance sweep transfers only the excess', async () => {
      sweepRuleRepo.findOne.mockResolvedValue({
        id: 'r1', tenantId: 't1', isActive: true, sweepType: SweepType.TARGET_BALANCE,
        targetBalance: 200, sourceAccountId: 'a1', targetAccountId: 'a2',
      });
      bankAccountRepo.findOne
        .mockResolvedValueOnce({ id: 'a1', currentBalance: 1000, currency: 'USD' })
        .mockResolvedValueOnce({ id: 'a2', currentBalance: 0, currency: 'USD' });
      const res: any = await svc.executeSweep('t1', 'r1');
      expect(res.amountTransferred).toBe(800);
      expect(res.sourceBalanceAfter).toBe(200);
    });

    it('rejects a sweep when source is at or below target', async () => {
      sweepRuleRepo.findOne.mockResolvedValue({
        id: 'r1', tenantId: 't1', isActive: true, sweepType: SweepType.TARGET_BALANCE,
        targetBalance: 2000, sourceAccountId: 'a1', targetAccountId: 'a2',
      });
      bankAccountRepo.findOne
        .mockResolvedValueOnce({ id: 'a1', currentBalance: 1000, currency: 'USD' })
        .mockResolvedValueOnce({ id: 'a2', currentBalance: 0, currency: 'USD' });
      await expect(svc.executeSweep('t1', 'r1')).rejects.toThrow(BadRequestException);
    });

    it('rejects an inactive sweep rule', async () => {
      sweepRuleRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', isActive: false });
      await expect(svc.executeSweep('t1', 'r1')).rejects.toThrow(BadRequestException);
    });

    it('throws when the rule does not exist', async () => {
      sweepRuleRepo.findOne.mockResolvedValue(null);
      await expect(svc.executeSweep('t1', 'rX')).rejects.toThrow(NotFoundException);
    });
  });
});
