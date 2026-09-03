import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PromisingService } from './promising.service';
import { SourcingRule, SourceType } from './entities/sourcing-rule.entity';
import { StockBalance } from '../../inventory/entities/stock-balance.entity';
import { PurchaseOrder, PoStatus } from '../../procurement/po/entities/purchase-order.entity';
import { PoLine } from '../../procurement/po/entities/po-line.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'rule-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'rule-1', ...x })),
  remove: jest.fn(),
});

describe('PromisingService — Phase 150 (GOP)', () => {
  let service: PromisingService;
  let ruleRepo: any, balanceRepo: any, poRepo: any, poLineRepo: any;

  beforeEach(async () => {
    ruleRepo = mockRepo(); balanceRepo = mockRepo(); poRepo = mockRepo(); poLineRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        PromisingService,
        { provide: getRepositoryToken(SourcingRule), useValue: ruleRepo },
        { provide: getRepositoryToken(StockBalance), useValue: balanceRepo },
        { provide: getRepositoryToken(PurchaseOrder), useValue: poRepo },
        { provide: getRepositoryToken(PoLine), useValue: poLineRepo },
      ],
    }).compile();
    service = module.get(PromisingService);
  });

  // ─── promise ──────────────────────────────────────────────────────

  it('promise — promises immediately when on-hand covers demand', async () => {
    balanceRepo.find.mockResolvedValue([{ qtyOnHand: 100, committedQty: 10 }]);
    const r = await service.promise('t1', { itemId: 'i1', quantity: 50, requiredDate: '2026-07-01' });
    expect(r.onHand).toBe(90);
    expect(r.promiseDate).toBe('2026-07-01'); // available now (uses requiredDate as label when no PO)
    expect(r.canPromiseByRequiredDate).toBe(true);
    expect(r.shortfall).toBe(0);
  });

  it('promise — uses scheduled PO receipts to reach the qty', async () => {
    balanceRepo.find.mockResolvedValue([{ qtyOnHand: 20, committedQty: 0 }]);
    poRepo.find.mockResolvedValue([
      { id: 'po1', status: PoStatus.APPROVED, deliveryDate: '2026-06-10', poDate: '2026-06-01' },
      { id: 'po2', status: PoStatus.RELEASED, deliveryDate: '2026-06-20', poDate: '2026-06-01' },
    ]);
    poLineRepo.find.mockResolvedValue([
      { poId: 'po1', quantity: 30, quantityReceived: 0 },
      { poId: 'po2', quantity: 40, quantityReceived: 0 },
    ]);
    const r = await service.promise('t1', { itemId: 'i1', itemCode: 'ITEM-1', quantity: 80, requiredDate: '2026-06-30' });
    // 20 on hand + 30 (Jun10) = 50; + 40 (Jun20) = 90 >= 80 → promise Jun 20
    expect(r.promiseDate).toBe('2026-06-20');
    expect(r.canPromiseByRequiredDate).toBe(true);
    expect(r.shortfall).toBe(0);
    expect(r.timeline).toHaveLength(3);
  });

  it('promise — reports shortfall when supply insufficient', async () => {
    balanceRepo.find.mockResolvedValue([{ qtyOnHand: 10, committedQty: 0 }]);
    poRepo.find.mockResolvedValue([{ id: 'po1', status: PoStatus.APPROVED, deliveryDate: '2026-06-10', poDate: '2026-06-01' }]);
    poLineRepo.find.mockResolvedValue([{ poId: 'po1', quantity: 20, quantityReceived: 0 }]);
    const r = await service.promise('t1', { itemId: 'i1', itemCode: 'ITEM-1', quantity: 100, requiredDate: '2026-06-30' });
    expect(r.promiseDate).toBeNull();
    expect(r.canPromiseByRequiredDate).toBe(false);
    expect(r.shortfall).toBe(70); // 100 - (10 + 20)
  });

  it('promise — excludes closed/received POs and fully-received lines', async () => {
    balanceRepo.find.mockResolvedValue([{ qtyOnHand: 0, committedQty: 0 }]);
    poRepo.find.mockResolvedValue([
      { id: 'po1', status: PoStatus.CLOSED, deliveryDate: '2026-06-10', poDate: '2026-06-01' },
      { id: 'po2', status: PoStatus.APPROVED, deliveryDate: '2026-06-15', poDate: '2026-06-01' },
    ]);
    poLineRepo.find.mockResolvedValue([
      { poId: 'po1', quantity: 50, quantityReceived: 0 }, // closed PO → excluded
      { poId: 'po2', quantity: 30, quantityReceived: 30 }, // fully received → excluded
    ]);
    const r = await service.promise('t1', { itemId: 'i1', itemCode: 'ITEM-1', quantity: 10 });
    expect(r.shortfall).toBe(10);
    expect(r.promiseDate).toBeNull();
  });

  it('promise — rejects non-positive qty', async () => {
    await expect(service.promise('t1', { itemId: 'i1', quantity: 0 })).rejects.toThrow(BadRequestException);
  });

  // ─── sourcing ─────────────────────────────────────────────────────

  it('createRule — requires item or category', async () => {
    await expect(service.createRule('t1', { sourceType: SourceType.VENDOR })).rejects.toThrow(BadRequestException);
  });

  it('sourcingPlan — default vendor source when no rules', async () => {
    ruleRepo.find.mockResolvedValue([]);
    const plan = await service.sourcingPlan('t1', 'i1', 100);
    expect(plan.sources).toHaveLength(1);
    expect(plan.sources[0].allocatedQty).toBe(100);
  });

  it('sourcingPlan — applies allocation % across ranked rules', async () => {
    ruleRepo.find.mockResolvedValue([
      { sourceType: SourceType.ORGANIZATION, sourceOrgId: 'o1', rank: 1, allocationPct: 60, leadTimeDays: 2, isActive: true },
      { sourceType: SourceType.VENDOR, vendorId: 'v1', rank: 2, allocationPct: 40, leadTimeDays: 5, isActive: true },
    ]);
    const plan = await service.sourcingPlan('t1', 'i1', 100);
    expect(plan.sources[0].allocatedQty).toBe(60);
    expect(plan.sources[1].allocatedQty).toBe(40);
  });
});
