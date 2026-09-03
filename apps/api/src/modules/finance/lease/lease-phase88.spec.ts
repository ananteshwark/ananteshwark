import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeaseService } from './lease.service';
import { Lease, LeaseStatus, PaymentTiming } from './entities/lease.entity';
import { LeaseScheduleLine } from './entities/lease-schedule-line.entity';
import { Account } from '../gl/entities/account.entity';
import { GlService } from '../gl/gl.service';

const mockRepo = () => ({
  create: jest.fn((d) => d),
  save: jest.fn(async (d) => (Array.isArray(d) ? d : { id: 'new-id', ...d })),
  findOne: jest.fn(),
  find: jest.fn(async () => []),
  count: jest.fn(async () => 0),
  createQueryBuilder: jest.fn(),
});

const makeQb = (one: any) => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getRawOne: jest.fn().mockResolvedValue(one),
  getMany: jest.fn().mockResolvedValue([]),
});

const TENANT = 'tenant-1';
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

describe('LeaseService', () => {
  let service: LeaseService;
  let leaseRepo: ReturnType<typeof mockRepo>;
  let lineRepo: ReturnType<typeof mockRepo>;
  let accountRepo: ReturnType<typeof mockRepo>;
  let glService: any;

  beforeEach(async () => {
    leaseRepo = mockRepo();
    lineRepo = mockRepo();
    accountRepo = mockRepo();
    glService = {
      findAccount: jest.fn(async (_t: string, id: string) => ({ id, code: 'X' })),
      postJournalEntry: jest.fn(async () => ({ id: 'je-1' })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaseService,
        { provide: getRepositoryToken(Lease), useValue: leaseRepo },
        { provide: getRepositoryToken(LeaseScheduleLine), useValue: lineRepo },
        { provide: getRepositoryToken(Account), useValue: accountRepo },
        { provide: GlService, useValue: glService },
      ],
    }).compile();
    service = module.get(LeaseService);
  });

  // ─── presentValue ────────────────────────────────────────────────────────────

  describe('presentValue', () => {
    it('sums undiscounted payments at a zero rate', () => {
      expect(service.presentValue(100, 0, 12, PaymentTiming.ARREARS)).toBe(1200);
    });

    it('discounts an ordinary annuity (arrears)', () => {
      // 12 payments of 1000 at 1%/period ≈ 11255.08
      const pv = service.presentValue(1000, 0.01, 12, PaymentTiming.ARREARS);
      expect(pv).toBeCloseTo(11255.08, 1);
    });

    it('annuity-due (advance) is the ordinary PV grossed up by (1+r)', () => {
      const ordinary = service.presentValue(1000, 0.01, 12, PaymentTiming.ARREARS);
      const due = service.presentValue(1000, 0.01, 12, PaymentTiming.ADVANCE);
      expect(due).toBeCloseTo(round2(ordinary * 1.01), 1);
    });

    it('returns zero for a non-positive term', () => {
      expect(service.presentValue(1000, 0.01, 0, PaymentTiming.ARREARS)).toBe(0);
    });
  });

  // ─── buildSchedule ─────────────────────────────────────────────────────────────

  describe('buildSchedule', () => {
    it('produces one row per period with month-end dates', () => {
      const rows = service.buildSchedule({
        startDate: '2026-01-01',
        termMonths: 3,
        payment: 1000,
        annualRate: 12,
        timing: PaymentTiming.ARREARS,
        rouAsset: 2940,
      });
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.periodEnd)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    });

    it('clears the liability to exactly zero on the final period', () => {
      const rows = service.buildSchedule({
        startDate: '2026-01-01',
        termMonths: 12,
        payment: 1000,
        annualRate: 12,
        timing: PaymentTiming.ARREARS,
        rouAsset: 11255.08,
      });
      expect(rows[rows.length - 1].closingLiability).toBe(0);
    });

    it('total principal equals the initial liability (PV)', () => {
      const pv = service.presentValue(1000, 0.01, 12, PaymentTiming.ARREARS);
      const rows = service.buildSchedule({
        startDate: '2026-01-01',
        termMonths: 12,
        payment: 1000,
        annualRate: 12,
        timing: PaymentTiming.ARREARS,
        rouAsset: pv,
      });
      const totalPrincipal = round2(rows.reduce((s, r) => s + r.principal, 0));
      expect(totalPrincipal).toBeCloseTo(pv, 1);
    });

    it('amortises the ROU asset straight-line summing to the gross asset', () => {
      const rows = service.buildSchedule({
        startDate: '2026-01-01',
        termMonths: 12,
        payment: 1000,
        annualRate: 12,
        timing: PaymentTiming.ARREARS,
        rouAsset: 12000,
      });
      expect(rows[0].amortization).toBe(1000);
      const totalAmort = round2(rows.reduce((s, r) => s + r.amortization, 0));
      expect(totalAmort).toBe(12000);
    });

    it('interest decreases over the life of the lease', () => {
      const rows = service.buildSchedule({
        startDate: '2026-01-01',
        termMonths: 12,
        payment: 1000,
        annualRate: 12,
        timing: PaymentTiming.ARREARS,
        rouAsset: 11255.08,
      });
      expect(rows[0].interest).toBeGreaterThan(rows[5].interest);
    });
  });

  // ─── createLease ─────────────────────────────────────────────────────────────────

  describe('createLease', () => {
    beforeEach(() => {
      leaseRepo.createQueryBuilder.mockReturnValue(makeQb({ mx: 0 }));
      leaseRepo.findOne
        .mockResolvedValueOnce(null) // duplicate check
        .mockResolvedValue({
          id: 'l1',
          tenantId: TENANT,
          leaseNumber: 'LSE-000001',
          rouAsset: 11255.08,
          accumulatedAmortization: 0,
          currency: 'USD',
        });
      leaseRepo.save.mockResolvedValue({
        id: 'l1',
        leaseNumber: 'LSE-000001',
        currency: 'USD',
        rouAsset: 11255.08,
      });
      accountRepo.findOne.mockResolvedValue({ id: 'acct', code: 'X' });
      lineRepo.find.mockResolvedValue([]);
    });

    it('rejects a non-positive payment', async () => {
      await expect(
        service.createLease(
          TENANT,
          { startDate: '2026-01-01', termMonths: 12, paymentAmount: 0, annualDiscountRate: 6 } as any,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('recognises the ROU asset and lease liability', async () => {
      await service.createLease(
        TENANT,
        { startDate: '2026-01-01', termMonths: 12, paymentAmount: 1000, annualDiscountRate: 12 } as any,
        'user-1',
      );
      const leaseSaved = leaseRepo.save.mock.calls[0][0];
      expect(leaseSaved.status).toBe(LeaseStatus.ACTIVE);
      expect(leaseSaved.initialLiability).toBeGreaterThan(0);
      expect(leaseSaved.rouAsset).toBe(leaseSaved.initialLiability); // no initial direct costs
      // initial recognition JE posted: Dr ROU, Cr liability
      const jeInput = glService.postJournalEntry.mock.calls[0][1];
      const dr = jeInput.lines.reduce((s: number, l: any) => s + (l.debit || 0), 0);
      const cr = jeInput.lines.reduce((s: number, l: any) => s + (l.credit || 0), 0);
      expect(round2(dr)).toBe(round2(cr));
    });

    it('adds initial direct costs to the ROU asset with a bank credit', async () => {
      await service.createLease(
        TENANT,
        {
          startDate: '2026-01-01',
          termMonths: 12,
          paymentAmount: 1000,
          annualDiscountRate: 12,
          initialDirectCosts: 500,
        } as any,
        'user-1',
      );
      const leaseSaved = leaseRepo.save.mock.calls[0][0];
      expect(round2(leaseSaved.rouAsset - leaseSaved.initialLiability)).toBe(500);
      const jeInput = glService.postJournalEntry.mock.calls[0][1];
      // three lines: Dr ROU, Cr liability, Cr bank
      expect(jeInput.lines).toHaveLength(3);
    });

    it('builds and saves the schedule lines', async () => {
      await service.createLease(
        TENANT,
        { startDate: '2026-01-01', termMonths: 6, paymentAmount: 1000, annualDiscountRate: 12 } as any,
        'user-1',
      );
      const savedLines = lineRepo.save.mock.calls[0][0];
      expect(savedLines).toHaveLength(6);
    });

    it('rejects a duplicate lease number', async () => {
      leaseRepo.findOne.mockReset();
      leaseRepo.findOne.mockResolvedValue({ id: 'existing' });
      await expect(
        service.createLease(
          TENANT,
          {
            leaseNumber: 'LSE-000001',
            startDate: '2026-01-01',
            termMonths: 12,
            paymentAmount: 1000,
            annualDiscountRate: 6,
          } as any,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── postDuePeriods ──────────────────────────────────────────────────────────────

  describe('postDuePeriods', () => {
    it('returns zeros when nothing is due', async () => {
      lineRepo.find.mockResolvedValue([]);
      const result = await service.postDuePeriods(TENANT, { periodEnd: '2026-03-31' }, 'user-1');
      expect(result.postedCount).toBe(0);
      expect(glService.postJournalEntry).not.toHaveBeenCalled();
    });

    it('posts a balanced JE per due line and updates totals', async () => {
      lineRepo.find.mockResolvedValue([
        {
          id: 's1', leaseId: 'l1', periodNumber: 1, periodEnd: '2026-01-31',
          openingLiability: 11255.08, payment: 1000, interest: 112.55, principal: 887.45,
          closingLiability: 10367.63, amortization: 937.92, posted: false,
        },
      ]);
      leaseRepo.findOne.mockResolvedValue({
        id: 'l1', tenantId: TENANT, leaseNumber: 'LSE-000001', currency: 'USD',
        accumulatedAmortization: 0, liabilityBalance: 11255.08, status: LeaseStatus.ACTIVE,
      });
      accountRepo.findOne.mockResolvedValue({ id: 'acct', code: 'X' });
      lineRepo.count.mockResolvedValue(5);

      const result = await service.postDuePeriods(TENANT, { periodEnd: '2026-01-31' }, 'user-1');

      expect(result.postedCount).toBe(1);
      expect(result.totalInterest).toBe(112.55);
      expect(result.totalPrincipal).toBe(887.45);
      expect(result.totalAmortization).toBe(937.92);

      const jeInput = glService.postJournalEntry.mock.calls[0][1];
      const dr = jeInput.lines.reduce((s: number, l: any) => s + (l.debit || 0), 0);
      const cr = jeInput.lines.reduce((s: number, l: any) => s + (l.credit || 0), 0);
      expect(round2(dr)).toBe(round2(cr));
    });

    it('closes the lease once the final period is posted', async () => {
      lineRepo.find.mockResolvedValue([
        {
          id: 's12', leaseId: 'l1', periodNumber: 12, periodEnd: '2026-12-31',
          openingLiability: 990.1, payment: 1000, interest: 9.9, principal: 990.1,
          closingLiability: 0, amortization: 937.92, posted: false,
        },
      ]);
      leaseRepo.findOne.mockResolvedValue({
        id: 'l1', tenantId: TENANT, leaseNumber: 'LSE-000001', currency: 'USD',
        accumulatedAmortization: 10317.0, liabilityBalance: 990.1, status: LeaseStatus.ACTIVE,
      });
      accountRepo.findOne.mockResolvedValue({ id: 'acct', code: 'X' });
      lineRepo.count.mockResolvedValue(0); // no unposted lines remain

      await service.postDuePeriods(TENANT, { periodEnd: '2026-12-31' }, 'user-1');

      const leaseSaved = leaseRepo.save.mock.calls.at(-1)![0];
      expect(leaseSaved.status).toBe(LeaseStatus.CLOSED);
      expect(leaseSaved.liabilityBalance).toBe(0);
    });
  });

  // ─── getLeaseDetail ──────────────────────────────────────────────────────────────

  describe('getLeaseDetail', () => {
    it('throws when the lease does not exist', async () => {
      leaseRepo.findOne.mockResolvedValue(null);
      await expect(service.getLeaseDetail(TENANT, 'bad')).rejects.toThrow(NotFoundException);
    });

    it('returns the lease, schedule and net ROU asset', async () => {
      leaseRepo.findOne.mockResolvedValue({
        id: 'l1', rouAsset: 12000, accumulatedAmortization: 3000,
      });
      lineRepo.find.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      const detail = await service.getLeaseDetail(TENANT, 'l1');
      expect(detail.schedule).toHaveLength(2);
      expect(detail.netRouAsset).toBe(9000);
    });
  });

  // ─── reporting ───────────────────────────────────────────────────────────────────

  describe('getMaturityAnalysis', () => {
    it('groups unposted principal and interest by year', async () => {
      lineRepo.find.mockResolvedValue([
        { periodEnd: '2026-06-30', principal: 500, interest: 50, payment: 550 },
        { periodEnd: '2026-12-31', principal: 500, interest: 30, payment: 530 },
        { periodEnd: '2027-06-30', principal: 400, interest: 10, payment: 410 },
      ]);
      const result = await service.getMaturityAnalysis(TENANT);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].year).toBe('2026');
      expect(result.rows[0].principal).toBe(1000);
      expect(result.totalPrincipal).toBe(1400);
      expect(result.totalInterest).toBe(90);
    });
  });

  describe('getPortfolioSummary', () => {
    it('aggregates ROU and liability across leases', async () => {
      leaseRepo.find.mockResolvedValue([
        { rouAsset: 10000, accumulatedAmortization: 2000, liabilityBalance: 8500 },
        { rouAsset: 5000, accumulatedAmortization: 1000, liabilityBalance: 4200 },
      ]);
      const summary = await service.getPortfolioSummary(TENANT);
      expect(summary.leaseCount).toBe(2);
      expect(summary.grossRouAsset).toBe(15000);
      expect(summary.accumulatedAmortization).toBe(3000);
      expect(summary.netRouAsset).toBe(12000);
      expect(summary.liabilityBalance).toBe(12700);
    });
  });
});
