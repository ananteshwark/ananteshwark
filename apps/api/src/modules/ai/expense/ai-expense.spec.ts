import { ForbiddenException } from '@nestjs/common';
import { AiExpenseService, ExpenseLineInput, RiskPolicy } from './ai-expense.service';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('AiExpenseService', () => {
  let service: AiExpenseService;
  let usageRepo: any;

  beforeEach(() => {
    usageRepo = mockRepo();
    service = new AiExpenseService(usageRepo); // no LLM client → OCR disabled
  });

  describe('receipt OCR (metered)', () => {
    it('reports OCR unavailable without an LLM key', async () => {
      expect(service.ocrEnabled).toBe(false);
      const res = await service.extractReceipt('t1', '2026-07', { text: 'COFFEE $4' });
      expect(res.available).toBe(false);
      expect(res.reason).toMatch(/not configured/);
      expect(usageRepo.save).not.toHaveBeenCalled(); // no meter consumed when disabled
    });

    it('reports usage against the monthly quota', async () => {
      usageRepo.findOne.mockResolvedValue({ tenantId: 't1', month: '2026-07', count: 3 });
      const u = await service.ocrUsage('t1', '2026-07');
      expect(u).toMatchObject({ count: 3, quota: 500, remaining: 497 });
    });
  });

  describe('scoreLine (deterministic)', () => {
    const policy: RiskPolicy = {
      highAmountThreshold: 1000,
      categoryCaps: { meals: 50 },
      allowedCategories: ['meals', 'travel', 'lodging'],
      receiptRequiredOver: 25,
    };

    it('flags a high, round, over-cap weekend line with no receipt', () => {
      const line: ExpenseLineInput = { amount: 1200, date: '2026-07-04', category: 'meals', hasReceipt: false }; // Sat
      const res = AiExpenseService.scoreLine(line, policy);
      const codes = res.flags.map((f) => f.code);
      expect(codes).toEqual(expect.arrayContaining(['HIGH_AMOUNT', 'ROUND_AMOUNT', 'WEEKEND', 'OVER_CAP', 'MISSING_RECEIPT']));
      expect(res.riskScore).toBe(95); // 25+10+10+30+20
    });

    it('flags an out-of-policy category', () => {
      const res = AiExpenseService.scoreLine({ amount: 30, date: '2026-07-06', category: 'gifts' }, policy);
      expect(res.flags.map((f) => f.code)).toContain('OUT_OF_POLICY_CATEGORY');
    });

    it('is clean for a compliant weekday line', () => {
      const res = AiExpenseService.scoreLine({ amount: 42.5, date: '2026-07-06', category: 'meals', hasReceipt: true }, policy); // Mon
      expect(res.flags).toHaveLength(0);
      expect(res.riskScore).toBe(0);
    });

    it('detects duplicate lines', () => {
      const a: ExpenseLineInput = { id: 'a', amount: 80, date: '2026-07-06', merchant: 'Cafe', category: 'meals', hasReceipt: true };
      const b: ExpenseLineInput = { id: 'b', amount: 80, date: '2026-07-06', merchant: 'Cafe', category: 'meals', hasReceipt: true };
      const res = AiExpenseService.scoreLine(a, policy, [a, b]);
      expect(res.flags.map((f) => f.code)).toContain('DUPLICATE');
    });
  });

  describe('scoreClaim', () => {
    it('rolls up the max line risk and counts high-risk lines', () => {
      const policy: RiskPolicy = { highAmountThreshold: 1000, receiptRequiredOver: 25 };
      const lines: ExpenseLineInput[] = [
        { amount: 20, date: '2026-07-06', category: 'meals', hasReceipt: true },      // clean (Mon)
        { amount: 5000, date: '2026-07-04', category: 'travel', hasReceipt: false },  // high + weekend + missing receipt
      ];
      const res = service.scoreClaim(lines, policy);
      expect(res.lines).toHaveLength(2);
      expect(res.claimRisk).toBeGreaterThanOrEqual(50);
      expect(res.highRiskCount).toBe(1);
    });
  });

  describe('isWeekend', () => {
    it('identifies weekends', () => {
      expect(AiExpenseService.isWeekend('2026-07-04')).toBe(true);  // Saturday
      expect(AiExpenseService.isWeekend('2026-07-05')).toBe(true);  // Sunday
      expect(AiExpenseService.isWeekend('2026-07-06')).toBe(false); // Monday
    });
  });
});
