import { AiSurveyService } from './ai-survey.service';

describe('AiSurveyService', () => {
  let service: AiSurveyService;
  beforeEach(() => { service = new AiSurveyService(); }); // no LLM key

  describe('scoreSentiment', () => {
    it('scores positive and negative comments', () => {
      expect(AiSurveyService.scoreSentiment('I love the supportive collaborative team').label).toBe('positive');
      expect(AiSurveyService.scoreSentiment('toxic management and burnout, feeling underpaid').label).toBe('negative');
    });

    it('is neutral with no lexicon hits', () => {
      expect(AiSurveyService.scoreSentiment('The meeting is at noon')).toMatchObject({ label: 'neutral', score: 0 });
    });

    it('handles negation (not great → negative)', () => {
      const r = AiSurveyService.scoreSentiment('this is not great');
      expect(r.label).toBe('negative');
    });
  });

  describe('extractThemes', () => {
    it('tags comments to themes with counts and average sentiment', () => {
      const themes = service.extractThemes([
        'my manager micromanaged me and it was stressful',    // Management + Workload, negative
        'great recognition and appreciated by the team',       // Recognition + Culture, positive
        'the pay is good but growth is stagnant',              // Compensation + Growth
      ]);
      const byName = Object.fromEntries(themes.map((t) => [t.theme, t]));
      expect(byName['Management'].count).toBe(1);
      expect(byName['Recognition'].count).toBe(1);
      expect(byName['Management'].avgSentiment).toBeLessThan(0);
      expect(themes[0].count).toBeGreaterThanOrEqual(themes[themes.length - 1].count); // sorted desc
    });
  });

  describe('sentimentHeatmap', () => {
    it('aggregates sentiment per dimension', () => {
      const rows = service.sentimentHeatmap([
        { text: 'love it, supportive and fair', dimension: 'Engineering' },
        { text: 'toxic and stressful', dimension: 'Engineering' },
        { text: 'good growth and flexible', dimension: 'Sales' },
      ]);
      const eng = rows.find((r) => r.dimension === 'Engineering')!;
      expect(eng.count).toBe(2);
      expect(eng.positive + eng.negative + eng.neutral).toBe(2);
    });
  });

  describe('impactAnalysis', () => {
    it('ranks themes by their negative pull on the outcome', () => {
      const res = service.impactAnalysis([
        { themes: ['Workload'], outcomeScore: 2 },
        { themes: ['Workload'], outcomeScore: 3 },
        { themes: ['Recognition'], outcomeScore: 9 },
        { themes: [], outcomeScore: 8 },
      ]);
      // Workload commenters avg 2.5 vs others ~8.33 → strong negative delta, ranked first
      expect(res[0].theme).toBe('Workload');
      expect(res[0].delta).toBeLessThan(0);
      expect(res[0].mentions).toBe(2);
    });
  });

  describe('summarize', () => {
    it('falls back to a template digest without an LLM key', async () => {
      expect(service.llmEnabled).toBe(false);
      const r = await service.summarize(['great recognition', 'toxic management']);
      expect(r.source).toBe('template');
      expect(r.summary).toMatch(/Recognition|Management/);
    });
  });
});
