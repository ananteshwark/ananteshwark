import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RevenueRecognitionService } from './revenue-recognition.service';
import { RevenueContract, RevenueContractStatus } from './entities/revenue-contract.entity';
import {
  PerformanceObligation,
  RecognitionMethod,
  ObligationStatus,
} from './entities/performance-obligation.entity';
import { RevenueSchedule } from './entities/revenue-schedule.entity';
import { Account } from '../gl/entities/account.entity';
import { GlService } from '../gl/gl.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRepo = () => ({
  create: jest.fn((d) => d),
  save: jest.fn(async (d) => (Array.isArray(d) ? d : { id: 'new-id', ...d })),
  findOne: jest.fn(),
  find: jest.fn(async () => []),
  createQueryBuilder: jest.fn(),
});

const makeQb = (raw: any) => ({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getRawOne: jest.fn().mockResolvedValue(raw?.one ?? null),
  getRawMany: jest.fn().mockResolvedValue(raw?.many ?? []),
  getMany: jest.fn().mockResolvedValue(raw?.many ?? []),
});

const TENANT = 'tenant-1';

describe('RevenueRecognitionService', () => {
  let service: RevenueRecognitionService;
  let contractRepo: ReturnType<typeof mockRepo>;
  let obligationRepo: ReturnType<typeof mockRepo>;
  let scheduleRepo: ReturnType<typeof mockRepo>;
  let accountRepo: ReturnType<typeof mockRepo>;
  let glService: any;

  beforeEach(async () => {
    contractRepo = mockRepo();
    obligationRepo = mockRepo();
    scheduleRepo = mockRepo();
    accountRepo = mockRepo();
    glService = {
      findAccount: jest.fn(async (_t: string, id: string) => ({ id, code: 'X' })),
      postJournalEntry: jest.fn(async () => ({ id: 'je-1' })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevenueRecognitionService,
        { provide: getRepositoryToken(RevenueContract), useValue: contractRepo },
        { provide: getRepositoryToken(PerformanceObligation), useValue: obligationRepo },
        { provide: getRepositoryToken(RevenueSchedule), useValue: scheduleRepo },
        { provide: getRepositoryToken(Account), useValue: accountRepo },
        { provide: GlService, useValue: glService },
      ],
    }).compile();
    service = module.get(RevenueRecognitionService);
  });

  // ─── Allocation ────────────────────────────────────────────────────────────────

  describe('allocateByRelativeSsp', () => {
    it('allocates in proportion to SSP', () => {
      const result = service.allocateByRelativeSsp(
        [{ standaloneSellingPrice: 600 }, { standaloneSellingPrice: 400 }],
        1000,
      );
      expect(result).toEqual([600, 400]);
    });

    it('applies a contract discount proportionally', () => {
      // SSP sums to 1200 but price is 1000 (≈16.67% discount)
      const result = service.allocateByRelativeSsp(
        [{ standaloneSellingPrice: 800 }, { standaloneSellingPrice: 400 }],
        1000,
      );
      expect(result[0]).toBeCloseTo(666.67, 2);
      // residue lands on last so the total is exact
      expect(round(result[0] + result[1])).toBe(1000);
    });

    it('puts rounding residue on the last obligation', () => {
      const result = service.allocateByRelativeSsp(
        [
          { standaloneSellingPrice: 1 },
          { standaloneSellingPrice: 1 },
          { standaloneSellingPrice: 1 },
        ],
        100,
      );
      expect(round(result.reduce((a, b) => a + b, 0))).toBe(100);
    });

    it('throws when total SSP is zero', () => {
      expect(() =>
        service.allocateByRelativeSsp([{ standaloneSellingPrice: 0 }], 100),
      ).toThrow(BadRequestException);
    });
  });

  // ─── Monthly schedule ────────────────────────────────────────────────────────

  describe('buildMonthlySchedule', () => {
    it('splits straight-line across inclusive months', () => {
      const rows = service.buildMonthlySchedule('2026-01-01', '2026-03-31', 300);
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.amount)).toEqual([100, 100, 100]);
      expect(rows.map((r) => r.periodEnd)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    });

    it('absorbs rounding residue in the final period', () => {
      const rows = service.buildMonthlySchedule('2026-01-01', '2026-03-31', 100);
      expect(round(rows.reduce((s, r) => s + r.amount, 0))).toBe(100);
      // 33.33 + 33.33 + 33.34
      expect(rows[2].amount).toBeCloseTo(33.34, 2);
    });

    it('handles a single month', () => {
      const rows = service.buildMonthlySchedule('2026-05-10', '2026-05-20', 500);
      expect(rows).toHaveLength(1);
      expect(rows[0].amount).toBe(500);
      expect(rows[0].periodEnd).toBe('2026-05-31');
    });

    it('throws when end is before start', () => {
      expect(() => service.buildMonthlySchedule('2026-03-01', '2026-01-01', 100)).toThrow(
        BadRequestException,
      );
    });
  });

  // ─── createContract ────────────────────────────────────────────────────────────

  describe('createContract', () => {
    beforeEach(() => {
      contractRepo.createQueryBuilder.mockReturnValue(makeQb({ one: { mx: 5 } }));
      contractRepo.findOne.mockResolvedValue({
        id: 'c1',
        tenantId: TENANT,
        contractNumber: 'REV-000006',
        currency: 'USD',
        totalTransactionPrice: 1000,
        status: RevenueContractStatus.ACTIVE,
      });
      obligationRepo.find.mockResolvedValue([]);
      scheduleRepo.find.mockResolvedValue([]);
    });

    it('rejects a non-positive transaction price', async () => {
      await expect(
        service.createContract(TENANT, {
          contractDate: '2026-01-01',
          totalTransactionPrice: 0,
          obligations: [
            { name: 'A', standaloneSellingPrice: 100, method: RecognitionMethod.POINT_IN_TIME },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects OVER_TIME obligation without start/end dates', async () => {
      await expect(
        service.createContract(TENANT, {
          contractDate: '2026-01-01',
          totalTransactionPrice: 1000,
          obligations: [
            { name: 'Support', standaloneSellingPrice: 1000, method: RecognitionMethod.OVER_TIME },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('auto-generates a contract number from the max sequence', async () => {
      contractRepo.findOne
        .mockResolvedValueOnce(null) // duplicate-check
        .mockResolvedValue({ id: 'c1', currency: 'USD', totalTransactionPrice: 1000 });
      await service.createContract(TENANT, {
        contractDate: '2026-01-01',
        totalTransactionPrice: 1000,
        obligations: [
          { name: 'License', standaloneSellingPrice: 1000, method: RecognitionMethod.POINT_IN_TIME },
        ],
      } as any);
      const saved = contractRepo.save.mock.calls[0][0];
      expect(saved.contractNumber).toBe('REV-000006');
      expect(saved.status).toBe(RevenueContractStatus.ACTIVE);
    });

    it('builds monthly schedules for OVER_TIME obligations', async () => {
      contractRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 'c1', currency: 'USD', totalTransactionPrice: 1200 });
      obligationRepo.save.mockResolvedValue({ id: 'ob1' });
      await service.createContract(TENANT, {
        contractDate: '2026-01-01',
        totalTransactionPrice: 1200,
        obligations: [
          {
            name: 'SaaS',
            standaloneSellingPrice: 1200,
            method: RecognitionMethod.OVER_TIME,
            startDate: '2026-01-01',
            endDate: '2026-12-31',
          },
        ],
      } as any);
      // 12 monthly schedule rows saved
      const scheduleSave = scheduleRepo.save.mock.calls[0][0];
      expect(scheduleSave).toHaveLength(12);
      expect(round(scheduleSave.reduce((s: number, r: any) => s + r.scheduledAmount, 0))).toBe(1200);
    });

    it('rejects a duplicate contract number', async () => {
      contractRepo.findOne.mockResolvedValue({ id: 'existing' });
      await expect(
        service.createContract(TENANT, {
          contractNumber: 'REV-000001',
          contractDate: '2026-01-01',
          totalTransactionPrice: 1000,
          obligations: [
            { name: 'A', standaloneSellingPrice: 1000, method: RecognitionMethod.POINT_IN_TIME },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── fulfillObligation ───────────────────────────────────────────────────────

  describe('fulfillObligation', () => {
    it('throws when obligation not found', async () => {
      obligationRepo.findOne.mockResolvedValue(null);
      await expect(service.fulfillObligation(TENANT, 'bad', '2026-01-15')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects fulfilling an OVER_TIME obligation', async () => {
      obligationRepo.findOne.mockResolvedValue({
        id: 'ob1',
        method: RecognitionMethod.OVER_TIME,
        status: ObligationStatus.PENDING,
      });
      await expect(service.fulfillObligation(TENANT, 'ob1', '2026-01-15')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects fulfilling an already-fulfilled obligation', async () => {
      obligationRepo.findOne.mockResolvedValue({
        id: 'ob1',
        method: RecognitionMethod.POINT_IN_TIME,
        status: ObligationStatus.FULFILLED,
      });
      await expect(service.fulfillObligation(TENANT, 'ob1', '2026-01-15')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('marks fulfilled and creates a schedule for the remaining amount', async () => {
      obligationRepo.findOne.mockResolvedValue({
        id: 'ob1',
        contractId: 'c1',
        method: RecognitionMethod.POINT_IN_TIME,
        status: ObligationStatus.PENDING,
        allocatedAmount: 500,
        recognizedAmount: 0,
      });
      await service.fulfillObligation(TENANT, 'ob1', '2026-02-15');
      const obligationSaved = obligationRepo.save.mock.calls[0][0];
      expect(obligationSaved.status).toBe(ObligationStatus.FULFILLED);
      expect(obligationSaved.fulfilledDate).toBe('2026-02-15');
      const scheduleSaved = scheduleRepo.save.mock.calls[0][0];
      expect(scheduleSaved.scheduledAmount).toBe(500);
      expect(scheduleSaved.periodEnd).toBe('2026-02-15');
    });
  });

  // ─── recognizeDue ──────────────────────────────────────────────────────────────

  describe('recognizeDue', () => {
    it('returns zeros when nothing is due', async () => {
      scheduleRepo.find.mockResolvedValue([]);
      const result = await service.recognizeDue(TENANT, { periodEnd: '2026-01-31' }, 'user-1');
      expect(result.recognizedCount).toBe(0);
      expect(result.journalEntryId).toBeNull();
      expect(glService.postJournalEntry).not.toHaveBeenCalled();
    });

    it('posts a balanced JE and marks schedules recognised', async () => {
      scheduleRepo.find.mockResolvedValue([
        { id: 's1', contractId: 'c1', obligationId: 'ob1', scheduledAmount: 100, recognized: false },
        { id: 's2', contractId: 'c1', obligationId: 'ob1', scheduledAmount: 50, recognized: false },
      ]);
      accountRepo.findOne.mockImplementation(async ({ where }: any) => ({
        id: where.code === '2200' ? 'acct-deferred' : 'acct-revenue',
        code: where.code,
      }));
      contractRepo.findOne.mockResolvedValue({ id: 'c1', currency: 'USD', totalTransactionPrice: 150 });
      obligationRepo.find.mockResolvedValue([
        { id: 'ob1', contractId: 'c1', allocatedAmount: 150, recognizedAmount: 0, status: ObligationStatus.PENDING },
      ]);

      const result = await service.recognizeDue(TENANT, { periodEnd: '2026-03-31' }, 'user-1');

      expect(result.recognizedCount).toBe(2);
      expect(result.totalRecognized).toBe(150);
      expect(result.journalEntryId).toBe('je-1');

      const jeInput = glService.postJournalEntry.mock.calls[0][1];
      const totalDebit = jeInput.lines.reduce((s: number, l: any) => s + (l.debit || 0), 0);
      const totalCredit = jeInput.lines.reduce((s: number, l: any) => s + (l.credit || 0), 0);
      expect(totalDebit).toBe(150);
      expect(totalCredit).toBe(150);
      // Dr deferred revenue, Cr revenue
      expect(jeInput.lines[0].accountId).toBe('acct-deferred');
      expect(jeInput.lines[0].debit).toBe(150);
      expect(jeInput.lines[1].accountId).toBe('acct-revenue');
      expect(jeInput.lines[1].credit).toBe(150);
    });

    it('completes the obligation and contract when fully recognised', async () => {
      scheduleRepo.find.mockResolvedValue([
        { id: 's1', contractId: 'c1', obligationId: 'ob1', scheduledAmount: 1000, recognized: false },
      ]);
      accountRepo.findOne.mockResolvedValue({ id: 'a', code: 'X' });
      contractRepo.findOne.mockResolvedValue({
        id: 'c1',
        currency: 'USD',
        totalTransactionPrice: 1000,
        status: RevenueContractStatus.ACTIVE,
      });
      obligationRepo.find
        .mockResolvedValueOnce([
          { id: 'ob1', contractId: 'c1', allocatedAmount: 1000, recognizedAmount: 0, status: ObligationStatus.PENDING },
        ])
        .mockResolvedValue([
          { id: 'ob1', contractId: 'c1', allocatedAmount: 1000, recognizedAmount: 1000, status: ObligationStatus.FULFILLED },
        ]);

      await service.recognizeDue(TENANT, { periodEnd: '2026-12-31' }, 'user-1');

      const obligationSaved = obligationRepo.save.mock.calls[0][0];
      expect(obligationSaved[0].status).toBe(ObligationStatus.FULFILLED);
      const contractSaved = contractRepo.save.mock.calls[0][0];
      expect(contractSaved.status).toBe(RevenueContractStatus.COMPLETED);
      expect(contractSaved.recognizedAmount).toBe(1000);
    });

    it('honours explicit account overrides', async () => {
      scheduleRepo.find.mockResolvedValue([
        { id: 's1', contractId: 'c1', obligationId: 'ob1', scheduledAmount: 200, recognized: false },
      ]);
      contractRepo.findOne.mockResolvedValue({ id: 'c1', currency: 'EUR', totalTransactionPrice: 200 });
      obligationRepo.find.mockResolvedValue([
        { id: 'ob1', contractId: 'c1', allocatedAmount: 200, recognizedAmount: 0, status: ObligationStatus.PENDING },
      ]);

      await service.recognizeDue(
        TENANT,
        {
          periodEnd: '2026-06-30',
          deferredRevenueAccountId: 'custom-deferred',
          revenueAccountId: 'custom-revenue',
        },
        'user-1',
      );

      expect(glService.findAccount).toHaveBeenCalledWith(TENANT, 'custom-deferred');
      expect(glService.findAccount).toHaveBeenCalledWith(TENANT, 'custom-revenue');
      // currency flows from the contract
      const jeInput = glService.postJournalEntry.mock.calls[0][1];
      expect(jeInput.currency).toBe('EUR');
    });
  });

  // ─── getContractSummary ──────────────────────────────────────────────────────

  describe('getContractSummary', () => {
    it('throws when the contract does not exist', async () => {
      contractRepo.findOne.mockResolvedValue(null);
      await expect(service.getContractSummary(TENANT, 'bad')).rejects.toThrow(NotFoundException);
    });

    it('computes per-obligation deferred and totals', async () => {
      contractRepo.findOne.mockResolvedValue({ id: 'c1', totalTransactionPrice: 1000 });
      obligationRepo.find.mockResolvedValue([
        { id: 'ob1', allocatedAmount: 600, recognizedAmount: 200 },
        { id: 'ob2', allocatedAmount: 400, recognizedAmount: 0 },
      ]);
      scheduleRepo.find.mockResolvedValue([]);

      const summary = await service.getContractSummary(TENANT, 'c1');
      expect(summary.obligations[0].deferredAmount).toBe(400);
      expect(summary.obligations[1].deferredAmount).toBe(400);
      expect(summary.totals).toEqual({ allocated: 1000, recognized: 200, deferred: 800 });
    });
  });

  // ─── getDeferredWaterfall ──────────────────────────────────────────────────────

  describe('getDeferredWaterfall', () => {
    it('aggregates unrecognised schedules by period', async () => {
      scheduleRepo.createQueryBuilder.mockReturnValue(
        makeQb({
          many: [
            { periodEnd: '2026-01-31', scheduled: '100' },
            { periodEnd: '2026-02-28', scheduled: '100' },
          ],
        }),
      );
      const result = await service.getDeferredWaterfall(TENANT);
      expect(result.rows).toHaveLength(2);
      expect(result.totalDeferred).toBe(200);
    });
  });
});

function round(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
