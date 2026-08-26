import { roundMoney, sumMoney, multiplyMoney } from './money.util';

describe('money.util', () => {
  describe('roundMoney', () => {
    it('rounds normal values to 2 decimals', () => {
      expect(roundMoney(10.244)).toBe(10.24);
      expect(roundMoney(10.245)).toBe(10.25);
      expect(roundMoney(10)).toBe(10);
    });

    it('fixes the classic half-cent float bug (1.005 -> 1.01, not 1.00)', () => {
      // Naive Math.round(1.005 * 100) / 100 returns 1.00 in JS.
      expect(roundMoney(1.005)).toBe(1.01);
      expect(roundMoney(2.675)).toBe(2.68);
    });

    it('rounds half away from zero for negatives', () => {
      expect(roundMoney(-1.005)).toBe(-1.01);
      expect(roundMoney(-10.244)).toBe(-10.24);
    });

    it('returns 0 for non-finite input', () => {
      expect(roundMoney(NaN)).toBe(0);
      expect(roundMoney(Infinity)).toBe(0);
    });
  });

  describe('sumMoney', () => {
    it('sums without float drift', () => {
      // 0.1 + 0.2 === 0.30000000000000004 with raw addition.
      expect(sumMoney([0.1, 0.2])).toBe(0.3);
      expect(sumMoney([0.1, 0.1, 0.1])).toBe(0.3);
    });

    it('sums a long list of cents exactly', () => {
      const cents = Array.from({ length: 1000 }, () => 0.01);
      expect(sumMoney(cents)).toBe(10);
    });

    it('handles negatives (credits/debits)', () => {
      expect(sumMoney([100.5, -0.5, -100])).toBe(0);
    });

    it('ignores non-finite entries', () => {
      expect(sumMoney([1.5, NaN, 2.5])).toBe(4);
    });
  });

  describe('multiplyMoney', () => {
    it('applies a rate and rounds to cents', () => {
      expect(multiplyMoney(100, 0.18)).toBe(18);
      expect(multiplyMoney(19.99, 0.0825)).toBe(1.65); // 1.649175 -> 1.65
    });
  });
});
