import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export const AI_SURVEY_LLM_CLIENT = 'AI_SURVEY_LLM_CLIENT';

// Compact sentiment lexicon (extend per tenant lexicon over time).
const POSITIVE = new Set([
  'great', 'good', 'excellent', 'love', 'happy', 'supportive', 'flexible', 'fair', 'growth', 'appreciated',
  'recognized', 'empowered', 'collaborative', 'transparent', 'rewarding', 'motivated', 'respected', 'positive', 'helpful', 'enjoy',
]);
const NEGATIVE = new Set([
  'bad', 'poor', 'terrible', 'hate', 'unhappy', 'toxic', 'unfair', 'stressful', 'burnout', 'overworked',
  'micromanaged', 'ignored', 'underpaid', 'frustrated', 'stagnant', 'disengaged', 'unclear', 'negative', 'difficult', 'leaving',
]);
const NEGATORS = new Set(['not', 'no', 'never', "n't", 'without', 'lack']);

// Default engagement theme taxonomy.
const DEFAULT_THEMES: Array<{ theme: string; keywords: string[] }> = [
  { theme: 'Recognition', keywords: ['recognition', 'recognized', 'appreciated', 'valued', 'kudos', 'praise'] },
  { theme: 'Compensation', keywords: ['pay', 'salary', 'compensation', 'underpaid', 'bonus', 'raise'] },
  { theme: 'Workload', keywords: ['workload', 'overworked', 'burnout', 'hours', 'stress', 'stressful', 'capacity'] },
  { theme: 'Management', keywords: ['manager', 'management', 'leadership', 'micromanaged', 'boss', 'supervisor'] },
  { theme: 'Growth', keywords: ['growth', 'career', 'promotion', 'learning', 'development', 'stagnant'] },
  { theme: 'Culture', keywords: ['culture', 'team', 'collaborative', 'toxic', 'inclusive', 'respect'] },
  { theme: 'Flexibility', keywords: ['flexible', 'remote', 'wfh', 'balance', 'hybrid'] },
];

export interface SentimentResult { score: number; label: 'positive' | 'neutral' | 'negative'; positives: number; negatives: number }

@Injectable()
export class AiSurveyService {
  private readonly logger = new Logger(AiSurveyService.name);
  private readonly client: Anthropic | null;

  constructor(@Optional() @Inject(AI_SURVEY_LLM_CLIENT) client?: Anthropic) {
    this.client = client ?? (process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 1, timeout: 30_000 }) : null);
  }

  get llmEnabled(): boolean { return !!this.client; }

  // ─── Sentiment (deterministic) ────────────────────────────────

  static tokenize(text: string): string[] {
    return (text ?? '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
  }

  /** Lexicon sentiment with simple negation flipping over a 3-token window. */
  static scoreSentiment(text: string): SentimentResult {
    const tokens = AiSurveyService.tokenize(text);
    let pos = 0, neg = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const negated = tokens.slice(Math.max(0, i - 3), i).some((w) => NEGATORS.has(w));
      if (POSITIVE.has(t)) { if (negated) neg++; else pos++; }
      else if (NEGATIVE.has(t)) { if (negated) pos++; else neg++; }
    }
    const total = pos + neg;
    const score = total ? Math.round(((pos - neg) / total) * 100) / 100 : 0;
    const label = score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';
    return { score, label, positives: pos, negatives: neg };
  }

  // ─── Themes (deterministic) ───────────────────────────────────

  /**
   * Tag each comment with matching themes and roll up per-theme counts and
   * average sentiment. Uses a supplied taxonomy or the default one.
   */
  extractThemes(comments: string[], taxonomy: Array<{ theme: string; keywords: string[] }> = DEFAULT_THEMES): Array<{ theme: string; count: number; avgSentiment: number; sample: string | null }> {
    const agg = new Map<string, { count: number; sentimentSum: number; sample: string | null }>();
    for (const c of comments ?? []) {
      const tokens = new Set(AiSurveyService.tokenize(c));
      const s = AiSurveyService.scoreSentiment(c).score;
      for (const { theme, keywords } of taxonomy) {
        if (keywords.some((k) => tokens.has(k))) {
          const a = agg.get(theme) ?? { count: 0, sentimentSum: 0, sample: null };
          a.count++; a.sentimentSum += s; a.sample = a.sample ?? c;
          agg.set(theme, a);
        }
      }
    }
    return [...agg.entries()]
      .map(([theme, a]) => ({ theme, count: a.count, avgSentiment: Math.round((a.sentimentSum / a.count) * 100) / 100, sample: a.sample }))
      .sort((a, b) => b.count - a.count);
  }

  // ─── Heatmap ──────────────────────────────────────────────────

  /** Sentiment distribution per dimension value (department, tenure band, …). */
  sentimentHeatmap(responses: Array<{ text: string; dimension: string }>): Array<{ dimension: string; positive: number; neutral: number; negative: number; avgScore: number; count: number }> {
    const agg = new Map<string, { positive: number; neutral: number; negative: number; sum: number; count: number }>();
    for (const r of responses ?? []) {
      const dim = r.dimension || '—';
      const s = AiSurveyService.scoreSentiment(r.text);
      const a = agg.get(dim) ?? { positive: 0, neutral: 0, negative: 0, sum: 0, count: 0 };
      a[s.label]++; a.sum += s.score; a.count++;
      agg.set(dim, a);
    }
    return [...agg.entries()].map(([dimension, a]) => ({
      dimension, positive: a.positive, neutral: a.neutral, negative: a.negative,
      avgScore: a.count ? Math.round((a.sum / a.count) * 100) / 100 : 0, count: a.count,
    })).sort((a, b) => b.count - a.count);
  }

  // ─── Impact analysis ──────────────────────────────────────────

  /**
   * For each theme, compare the average outcome (e.g. eNPS) of respondents who
   * raised it vs those who did not. A large negative delta means the theme
   * drags the score down — a priority driver.
   */
  impactAnalysis(responses: Array<{ themes: string[]; outcomeScore: number }>): Array<{ theme: string; withAvg: number; withoutAvg: number; delta: number; mentions: number }> {
    const all = responses ?? [];
    const themes = new Set<string>();
    all.forEach((r) => (r.themes ?? []).forEach((t) => themes.add(t)));
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const out = [...themes].map((theme) => {
      const withT = all.filter((r) => (r.themes ?? []).includes(theme)).map((r) => Number(r.outcomeScore));
      const withoutT = all.filter((r) => !(r.themes ?? []).includes(theme)).map((r) => Number(r.outcomeScore));
      const withAvg = Math.round(avg(withT) * 100) / 100;
      const withoutAvg = Math.round(avg(withoutT) * 100) / 100;
      return { theme, withAvg, withoutAvg, delta: Math.round((withAvg - withoutAvg) * 100) / 100, mentions: withT.length };
    });
    // Most negative impact first (biggest drivers of a lower score).
    return out.sort((a, b) => a.delta - b.delta);
  }

  // ─── Optional LLM narrative ───────────────────────────────────

  async summarize(comments: string[]): Promise<{ source: 'llm' | 'template'; summary: string }> {
    const themes = this.extractThemes(comments);
    if (!this.client) {
      const top = themes.slice(0, 3).map((t) => `${t.theme} (${t.count}, avg ${t.avgSentiment})`);
      return { source: 'template', summary: top.length ? `Top themes: ${top.join('; ')}.` : 'No themes detected.' };
    }
    try {
      const response = await this.client.messages.create({
        model: process.env.AI_SURVEY_MODEL ?? 'claude-opus-4-8',
        max_tokens: 512,
        output_config: { effort: 'low' },
        system: 'You summarize employee survey verbatims into an unbiased, concise (3-4 sentence) digest of themes and sentiment. Ground only in the comments provided.',
        messages: [{ role: 'user', content: JSON.stringify({ comments: (comments ?? []).slice(0, 200), themes }) }],
      } as Anthropic.MessageCreateParamsNonStreaming);
      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { source: 'llm', summary: text || 'No summary generated.' };
    } catch (e: any) {
      this.logger.warn(`survey summarize failed: ${e?.message ?? e}`);
      return { source: 'template', summary: themes.slice(0, 3).map((t) => t.theme).join(', ') };
    }
  }
}
