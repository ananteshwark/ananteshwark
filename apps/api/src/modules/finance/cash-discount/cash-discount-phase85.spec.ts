import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CashDiscountService } from './cash-discount.service';
import { PaymentTerm } from './entities/payment-term.entity';
import { CashDiscount, CashDiscountType } from './entities/cash-discount.entity';

const mockRepo = () => ({
  create: jest.fn((d) => d),
  save: jest.fn(async (d) => ({ id: 'new-id', ...d })),
  findOne: jest.fn(),
  find: jest.fn(async () => []),
  remove: jest.fn(async (e) => e),
  createQueryBuilder: jest.fn(),
});

const makeQb = (results: any[]) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(results),
});

const TENANT = 'tenant-1';

const makeTerm = (overrides: Partial<PaymentTerm> = {}): PaymentTerm => ({
  id: 'term-1',
  tenantId: TENANT,
  code: '2/10NET30',
  name: '2% 10 days, net 30',
  netDays: 30,
  tiers: [{ discountPercent: 2, withinDays: 10 }],
  description: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('CashDiscountService', () => {
  let service: CashDiscountService;
  let termRepo: ReturnType<typeof mockRepo>;
  let discountRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    termRepo = mockRepo();
    discountRepo = mockRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashDiscountService,
        { provide: getRepositoryToken(PaymentTerm), useValue: termRepo },
        { provide: getRepositoryToken(CashDiscount), useValue: discountRepo },
      ],
    }).compile();
    service = module.get(CashDiscountService);
  });

  // ─── Payment Term CRUD ────────────────────────────────────────────────────────

  describe('createPaymentTerm', () => {
    it('creates a term with sorted tiers', async () => {
      termRepo.findOne.mockResolvedValue(null);
      const dto = {
        code: 'X',
        name: 'X',
        netDays: 30,
        tiers: [
          { discountPercent: 1, withinDays: 20 },
          { discountPercent: 2, withinDays: 10 },
        ],
      };
      await service.createPaymentTerm(TENANT, dto as any);
      const saved = termRepo.save.mock.calls[0][0];
      // sorted best-first
      expect(saved.tiers[0].discountPercent).toBe(2);
      expect(saved.tiers[1].discountPercent).toBe(1);
    });

    it('rejects duplicate code', async () => {
      termRepo.findOne.mockResolvedValue(makeTerm());
      await expect(
        service.createPaymentTerm(TENANT, { code: '2/10NET30', name: 'x', netDays: 30 } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updatePaymentTerm', () => {
    it('throws if not found', async () => {
      termRepo.findOne.mockResolvedValue(null);
      await expect(service.updatePaymentTerm(TENANT, 'bad', {})).rejects.toThrow(NotFoundException);
    });

    it('updates net days and tiers', async () => {
      termRepo.findOne.mockResolvedValue(makeTerm());
      await service.updatePaymentTerm(TENANT, 'term-1', {
        netDays: 45,
        tiers: [{ discountPercent: 3, withinDays: 5 }],
      } as any);
      const saved = termRepo.save.mock.calls[0][0];
      expect(saved.netDays).toBe(45);
      expect(saved.tiers[0].discountPercent).toBe(3);
    });
  });

  describe('seedDefaults', () => {
    it('creates missing defaults and skips existing', async () => {
      // NET30 exists, others don't
      termRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.code === 'NET30' ? makeTerm({ code: 'NET30' }) : null,
      );
      const result = await service.seedDefaults(TENANT);
      expect(result).toHaveLength(4);
      // 3 created (NET30 skipped)
      expect(termRepo.save).toHaveBeenCalledTimes(3);
    });
  });

  // ─── Discount Computation ─────────────────────────────────────────────────────

  describe('computeForTerm', () => {
    it('applies 2% when paid within 10 days', () => {
      const term = makeTerm();
      const r = service.computeForTerm(term, 1000, '2026-01-01', '2026-01-08');
      expect(r.applicable).toBe(true);
      expect(r.discountPercent).toBe(2);
      expect(r.discountAmount).toBe(20);
      expect(r.netAmount).toBe(980);
      expect(r.daysTaken).toBe(7);
    });

    it('applies no discount when paid after the window', () => {
      const term = makeTerm();
      const r = service.computeForTerm(term, 1000, '2026-01-01', '2026-01-15');
      expect(r.applicable).toBe(false);
      expect(r.discountAmount).toBe(0);
      expect(r.netAmount).toBe(1000);
    });

    it('picks the best tier whose window covers the payment date', () => {
      const term = makeTerm({
        tiers: [
          { discountPercent: 2, withinDays: 10 },
          { discountPercent: 1, withinDays: 20 },
        ],
      });
      // day 15 -> only 1% tier window covers it
      const r = service.computeForTerm(term, 1000, '2026-01-01', '2026-01-16');
      expect(r.discountPercent).toBe(1);
      expect(r.discountAmount).toBe(10);
    });

    it('takes the highest discount within the earliest window', () => {
      const term = makeTerm({
        tiers: [
          { discountPercent: 2, withinDays: 10 },
          { discountPercent: 1, withinDays: 20 },
        ],
      });
      // day 5 -> both windows cover; best (2%) wins
      const r = service.computeForTerm(term, 1000, '2026-01-01', '2026-01-06');
      expect(r.discountPercent).toBe(2);
    });

    it('does not apply a discount for a payment before the baseline date', () => {
      const term = makeTerm();
      const r = service.computeForTerm(term, 1000, '2026-01-10', '2026-01-05');
      expect(r.applicable).toBe(false);
      expect(r.daysTaken).toBeLessThan(0);
    });

    it('computes the net due date from netDays', () => {
      const term = makeTerm({ netDays: 30 });
      const r = service.computeForTerm(term, 1000, '2026-01-01', '2026-01-05');
      expect(r.netDueDate).toBe('2026-01-31');
    });

    it('returns no discount for a term with no tiers', () => {
      const term = makeTerm({ tiers: [] });
      const r = service.computeForTerm(term, 1000, '2026-01-01', '2026-01-02');
      expect(r.applicable).toBe(false);
      expect(r.discountAmount).toBe(0);
    });
  });

  describe('computeByCode', () => {
    it('throws when the term code is unknown', async () => {
      termRepo.findOne.mockResolvedValue(null);
      await expect(
        service.computeByCode(TENANT, 'NOPE', 1000, '2026-01-01', '2026-01-05'),
      ).rejects.toThrow(NotFoundException);
    });

    it('computes for a found term', async () => {
      termRepo.findOne.mockResolvedValue(makeTerm());
      const r = await service.computeByCode(TENANT, '2/10NET30', 500, '2026-01-01', '2026-01-05');
      expect(r.discountAmount).toBe(10);
    });
  });

  // ─── Recording + Report ───────────────────────────────────────────────────────

  describe('recordDiscount', () => {
    it('persists a realised discount', async () => {
      await service.recordDiscount(TENANT, {
        type: CashDiscountType.AP,
        partyId: 'v1',
        partyName: 'Vendor 1',
        baseAmount: 1000,
        discountPercent: 2,
        discountAmount: 20,
        paymentDate: '2026-01-08',
      });
      expect(discountRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'AP', discountAmount: 20, partyId: 'v1' }),
      );
    });
  });

  describe('getUtilizationReport', () => {
    it('aggregates by party with totals and avg percent', async () => {
      discountRepo.createQueryBuilder.mockReturnValue(
        makeQb([
          { type: 'AP', partyId: 'v1', partyName: 'Vendor 1', baseAmount: 1000, discountAmount: 20 },
          { type: 'AP', partyId: 'v1', partyName: 'Vendor 1', baseAmount: 500, discountAmount: 10 },
          { type: 'AP', partyId: 'v2', partyName: 'Vendor 2', baseAmount: 2000, discountAmount: 40 },
        ]),
      );
      const report = await service.getUtilizationReport(TENANT, { type: CashDiscountType.AP });
      expect(report.rows).toHaveLength(2);
      const v1 = report.rows.find(r => r.partyId === 'v1')!;
      expect(v1.discountCount).toBe(2);
      expect(v1.totalBase).toBe(1500);
      expect(v1.totalDiscount).toBe(30);
      expect(v1.avgPercent).toBe(2);
      expect(report.totals.totalDiscount).toBe(70);
      expect(report.totals.discountCount).toBe(3);
      // sorted by totalDiscount desc -> v2 (40) first
      expect(report.rows[0].partyId).toBe('v2');
    });

    it('returns zeros for empty data', async () => {
      discountRepo.createQueryBuilder.mockReturnValue(makeQb([]));
      const report = await service.getUtilizationReport(TENANT, {});
      expect(report.rows).toHaveLength(0);
      expect(report.totals.totalDiscount).toBe(0);
    });
  });
});
