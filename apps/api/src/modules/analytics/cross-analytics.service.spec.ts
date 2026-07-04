import { CrossAnalyticsService } from './cross-analytics.service';
import { EmployeeStatus } from '../hr/employees/entities/employee.entity';
import { AccountType } from '../finance/gl/entities/account.entity';

/**
 * Cross-module analytics: hire-to-retire attrition/tenure math, order-to-cash
 * DSO and collections effectiveness, finance ratios preferring GL balances
 * with an AR/AP fallback, and per-metric failure isolation (safe()).
 */
describe('CrossAnalyticsService', () => {
  let service: CrossAnalyticsService;
  let employeeRepo: any, jobPostingRepo: any, jobOfferRepo: any, poRepo: any, billRepo: any,
    invoiceRepo: any, receiptRepo: any, soRepo: any, accountRepo: any, journalLineRepo: any;

  const mockRepo = () => ({
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
  });

  beforeEach(() => {
    employeeRepo = mockRepo(); jobPostingRepo = mockRepo(); jobOfferRepo = mockRepo();
    poRepo = mockRepo(); billRepo = mockRepo(); invoiceRepo = mockRepo();
    receiptRepo = mockRepo(); soRepo = mockRepo(); accountRepo = mockRepo(); journalLineRepo = mockRepo();
    service = new CrossAnalyticsService(
      employeeRepo, jobPostingRepo, jobOfferRepo, poRepo, billRepo,
      invoiceRepo, receiptRepo, soRepo, accountRepo, journalLineRepo,
    );
  });

  it('hireToRetire computes attrition against average headcount and offer acceptance', async () => {
    // headcount 100, active 90, hires 20, leavers 10 → attrition 10 / (90 + 5) ≈ 10.53%
    employeeRepo.count
      .mockResolvedValueOnce(100).mockResolvedValueOnce(90)
      .mockResolvedValueOnce(20).mockResolvedValueOnce(10);
    employeeRepo.find.mockResolvedValue([]);
    jobOfferRepo.count.mockResolvedValueOnce(8).mockResolvedValueOnce(6); // 75% acceptance
    const r = await service.hireToRetire('t1');
    expect(r.headcount).toBe(100);
    expect(r.attritionRatePct).toBeCloseTo(10.53, 1);
    expect(r.offerAcceptanceRatePct).toBe(75);
  });

  it('a failing metric degrades to its fallback instead of breaking the dashboard', async () => {
    employeeRepo.count.mockRejectedValue(new Error('missing column'));
    employeeRepo.find.mockRejectedValue(new Error('missing column'));
    jobPostingRepo.count.mockRejectedValue(new Error('down'));
    jobOfferRepo.count.mockRejectedValue(new Error('down'));
    const r = await service.hireToRetire('t1');
    expect(r).toEqual({
      headcount: 0, activeCount: 0, attritionRatePct: 0, avgTenureMonths: 0,
      newHires12mo: 0, openRequisitions: 0, offerAcceptanceRatePct: 0,
    });
  });

  it('orderToCash computes DSO, overdue receivables and collections effectiveness', async () => {
    soRepo.find.mockResolvedValue([{ total: 500 }, { total: 500 }]); // open orders
    // revenue invoices: 36500 over 12mo → daily 100
    invoiceRepo.find
      .mockResolvedValueOnce([{ total: 36500 }]) // revenue
      .mockResolvedValueOnce([                    // open invoices
        { balanceDue: 1000, dueDate: '2020-01-01' }, // overdue
        { balanceDue: 500, dueDate: '2099-01-01' },
      ]);
    receiptRepo.find.mockResolvedValue([{ amount: 4500 }]);
    const r = await service.orderToCash('t1');
    expect(r.openOrders).toBe(2);
    expect(r.openOrderValue).toBe(1000);
    expect(r.receivablesOutstanding).toBe(1500);
    expect(r.overdueReceivables).toBe(1000);
    expect(r.dso).toBe(15); // 1500 / (36500/365)
    expect(r.collectionsEffectivenessPct).toBe(75); // 4500 / 6000
  });

  it('financeRatios prefers GL balances (debit-normal assets, credit-normal liabilities)', async () => {
    accountRepo.find.mockResolvedValue([
      { id: 'a1', type: AccountType.ASSET },
      { id: 'l1', type: AccountType.LIABILITY },
    ]);
    journalLineRepo.find
      .mockResolvedValueOnce([{ debit: 1000, credit: 200 }])  // assets: 800
      .mockResolvedValueOnce([{ debit: 100, credit: 500 }]);  // liabilities: 400
    const r = await service.financeRatios('t1');
    expect(r).toMatchObject({
      currentAssetsProxy: 800, currentLiabilitiesProxy: 400,
      workingCapital: 400, currentRatio: 2, source: 'gl', approximate: true,
    });
  });

  it('financeRatios falls back to AR/AP outstanding when GL is empty', async () => {
    accountRepo.find.mockResolvedValue([]);
    invoiceRepo.find.mockResolvedValue([{ balanceDue: 900 }]);
    billRepo.find.mockResolvedValue([{ balanceDue: 300 }]);
    const r = await service.financeRatios('t1');
    expect(r).toMatchObject({
      currentAssetsProxy: 900, currentLiabilitiesProxy: 300, currentRatio: 3, source: 'ar_ap',
    });
  });

  it('summary combines all four perspectives', async () => {
    const s = await service.summary('t1');
    expect(Object.keys(s)).toEqual(
      expect.arrayContaining(['hireToRetire', 'procureToPay', 'orderToCash', 'financeRatios', 'generatedAt']));
  });
});
