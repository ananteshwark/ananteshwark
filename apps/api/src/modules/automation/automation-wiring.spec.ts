import { ExpensesService } from '../expenses/expenses.service';
import { ExpenseClaimStatus } from '../expenses/entities/expense-claim.entity';
import { CreditService } from '../sales/credit.service';
import { SalesService } from '../sales/sales.service';
import { SalesOrderStatus } from '../sales/entities/sales-order.entity';
import { RequisitionService } from '../procurement/requisition/requisition.service';
import { RequisitionStatus } from '../procurement/requisition/entities/purchase-requisition.entity';

/**
 * Wiring proof: business workflows emit automation events at their lifecycle
 * points, and services constructed WITHOUT an automation dependency (legacy
 * positional construction) still work — emission is strictly optional.
 */
const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  createQueryBuilder: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ max: '0', mx: 0 }),
  })),
});

describe('Automation wiring in business workflows', () => {
  const automation = { emit: jest.fn().mockResolvedValue(undefined) };
  beforeEach(() => automation.emit.mockClear());

  it('expense approval emits expense.approved with the claim facts', async () => {
    const claimRepo = mockRepo();
    claimRepo.findOne.mockResolvedValue({
      id: 'c1', tenantId: 't1', status: ExpenseClaimStatus.SUBMITTED,
      claimNumber: 'EXP-000001', employeeId: 'e1', totalAmount: 750,
    });
    const service = new ExpensesService(
      mockRepo() as any, claimRepo as any, mockRepo() as any, mockRepo() as any,
      {} as any, automation as any,
    );
    await service.approveClaim('t1', 'c1', 'mgr1');
    expect(automation.emit).toHaveBeenCalledWith('t1', 'expense.approved', expect.objectContaining({
      claimNumber: 'EXP-000001', totalAmount: 750, approvedById: 'mgr1',
    }));
  });

  it('sales order confirmation emits sales_order.confirmed', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({
      id: 'so1', tenantId: 't1', status: SalesOrderStatus.DRAFT, orderNumber: 'SO-000001', customerId: 'c1', total: 900,
    });
    const lineRepo = mockRepo();
    const service = new SalesService(
      orderRepo as any, lineRepo as any, mockRepo() as any, mockRepo() as any,
      {} as any, {} as any, {} as any,
      { checkCredit: jest.fn().mockResolvedValue({ status: 'OK' }) } as any,
      { checkATP: jest.fn().mockResolvedValue({ status: 'OK' }), commitForItem: jest.fn() } as any,
      automation as any,
    );
    await service.confirmOrder('t1', 'so1');
    expect(automation.emit).toHaveBeenCalledWith('t1', 'sales_order.confirmed', expect.objectContaining({
      orderNumber: 'SO-000001', total: 900,
    }));
  });

  it('requisition approval emits requisition.approved', async () => {
    const reqRepo = mockRepo();
    reqRepo.findOne.mockResolvedValue({
      id: 'r1', tenantId: 't1', status: RequisitionStatus.SUBMITTED, reqNumber: 'PR-000001', totalAmount: 1234,
    });
    const lineRepo = mockRepo();
    lineRepo.find.mockResolvedValue([]);
    const service = new RequisitionService(reqRepo as any, lineRepo as any, automation as any);
    await service.approveRequisition('t1', 'r1', 'boss');
    expect(automation.emit).toHaveBeenCalledWith('t1', 'requisition.approved', expect.objectContaining({
      reqNumber: 'PR-000001', approvedById: 'boss',
    }));
  });

  it('services built without the automation dependency still work (optional wiring)', async () => {
    const reqRepo = mockRepo();
    reqRepo.findOne.mockResolvedValue({
      id: 'r1', tenantId: 't1', status: RequisitionStatus.SUBMITTED, reqNumber: 'PR-000001', totalAmount: 1,
    });
    const lineRepo = mockRepo();
    lineRepo.find.mockResolvedValue([]);
    const legacy = new RequisitionService(reqRepo as any, lineRepo as any); // no automation
    const r = await legacy.approveRequisition('t1', 'r1', 'boss');
    expect(r).toBeDefined(); // no crash, emission silently skipped
  });
});
