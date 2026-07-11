import { AiInsightsService, MeritLineSignal } from './ai-insights.service';

describe('AiInsightsService', () => {
  describe('meritOutliers', () => {
    it('flags a clear outlier within a rating group and skips small groups', () => {
      const lines: MeritLineSignal[] = [
        { employeeId: 'e1', proposedPct: 10, performanceRating: 'MEETS' },
        { employeeId: 'e2', proposedPct: 10, performanceRating: 'MEETS' },
        { employeeId: 'e3', proposedPct: 10, performanceRating: 'MEETS' },
        { employeeId: 'e4', proposedPct: 10, performanceRating: 'MEETS' },
        { employeeId: 'e5', proposedPct: 40, performanceRating: 'MEETS' }, // outlier
        { employeeId: 'e6', proposedPct: 99, performanceRating: 'EXCEEDS' }, // group too small (1)
      ];
      const res = AiInsightsService.meritOutliers(lines, 1.5);
      expect(res.map((r) => r.employeeId)).toEqual(['e5']);
      expect(res[0].z).toBeGreaterThan(1.5);
    });

    it('returns nothing when a group has zero variance', () => {
      const lines: MeritLineSignal[] = [
        { employeeId: 'e1', proposedPct: 5, performanceRating: 'MEETS' },
        { employeeId: 'e2', proposedPct: 5, performanceRating: 'MEETS' },
        { employeeId: 'e3', proposedPct: 5, performanceRating: 'MEETS' },
      ];
      expect(AiInsightsService.meritOutliers(lines)).toEqual([]);
    });
  });

  describe('biasAlerts', () => {
    it('flags a demographic gap beyond the threshold and grades severity', () => {
      const lines: MeritLineSignal[] = [
        { employeeId: 'e1', proposedPct: 4, performanceRating: 'MEETS', demographic: 'F' },
        { employeeId: 'e2', proposedPct: 4, performanceRating: 'MEETS', demographic: 'F' },
        { employeeId: 'e3', proposedPct: 12, performanceRating: 'MEETS', demographic: 'M' },
      ];
      const res = AiInsightsService.biasAlerts(lines, 2);
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({ rating: 'MEETS', gap: 8, severity: 'HIGH' }); // 8 > 2*2
    });

    it('ignores ratings with a single demographic group', () => {
      const lines: MeritLineSignal[] = [{ employeeId: 'e1', proposedPct: 4, performanceRating: 'MEETS', demographic: 'F' }];
      expect(AiInsightsService.biasAlerts(lines)).toEqual([]);
    });
  });

  describe('distribution', () => {
    it('summarises the proposed-% distribution', () => {
      const lines: MeritLineSignal[] = [
        { employeeId: 'e1', proposedPct: 2 }, { employeeId: 'e2', proposedPct: 4 }, { employeeId: 'e3', proposedPct: 6 },
      ];
      const d = AiInsightsService.distribution(lines);
      expect(d).toMatchObject({ count: 3, mean: 4, median: 4, min: 2, max: 6 });
    });
  });

  describe('staffingRecommendations', () => {
    it('recommends adding to understaffed and releasing from overstaffed slots', () => {
      const res = AiInsightsService.staffingRecommendations(
        [{ slot: 'Mon-AM', requiredHeadcount: 5 }, { slot: 'Mon-PM', requiredHeadcount: 3 }],
        [{ slot: 'Mon-AM', headcount: 2 }, { slot: 'Mon-PM', headcount: 5 }],
      );
      const bySlot = Object.fromEntries(res.map((r) => [r.slot, r]));
      expect(bySlot['Mon-AM'].action).toBe('ADD 3');
      expect(bySlot['Mon-PM'].action).toBe('RELEASE 2');
      expect(res[0].slot).toBe('Mon-AM'); // most understaffed first
    });
  });

  describe('overtimeRisk', () => {
    it('flags employees over the weekly threshold, summing shifts', () => {
      const res = AiInsightsService.overtimeRisk(
        [{ employeeId: 'e1', hours: 30 }, { employeeId: 'e1', hours: 15 }, { employeeId: 'e2', hours: 20 }],
        40,
      );
      expect(res).toEqual([{ employeeId: 'e1', hours: 45, overBy: 5 }]);
    });
  });
});
