import { Injectable } from '@nestjs/common';

export interface MeritLineSignal {
  employeeId: string;
  proposedPct: number;
  performanceRating?: string | null;
  demographic?: string | null;
}

export interface DemandSlot { slot: string; requiredHeadcount: number }
export interface ScheduledSlot { slot: string; headcount: number }

function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * AI insights: statistical merit-cycle bias/outlier detection and workforce
 * (WFM) staffing recommendations. Fully deterministic — no LLM dependency.
 */
@Injectable()
export class AiInsightsService {
  // ─── Merit outliers (z-score within rating group) ─────────────

  /**
   * Flag proposed increments that are statistical outliers within their
   * performance-rating peer group (|z| ≥ threshold). Groups with < 3 members
   * are skipped (too small to be meaningful).
   */
  static meritOutliers(lines: MeritLineSignal[], zThreshold = 2): Array<{ employeeId: string; proposedPct: number; rating: string; z: number }> {
    const byRating = new Map<string, MeritLineSignal[]>();
    for (const l of lines ?? []) {
      const key = l.performanceRating ?? 'UNRATED';
      (byRating.get(key) ?? byRating.set(key, []).get(key)!).push(l);
    }
    const out: Array<{ employeeId: string; proposedPct: number; rating: string; z: number }> = [];
    for (const [rating, group] of byRating) {
      if (group.length < 3) continue;
      const pcts = group.map((g) => Number(g.proposedPct));
      const m = mean(pcts), sd = stddev(pcts);
      if (sd === 0) continue;
      for (const g of group) {
        const z = r2((Number(g.proposedPct) - m) / sd);
        if (Math.abs(z) >= zThreshold) out.push({ employeeId: g.employeeId, proposedPct: Number(g.proposedPct), rating, z });
      }
    }
    return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  }

  // ─── Merit bias alerts (demographic gap per rating) ───────────

  static biasAlerts(lines: MeritLineSignal[], thresholdPct = 2): Array<{ rating: string; groups: Array<{ demographic: string; avgPct: number; n: number }>; gap: number; severity: 'HIGH' | 'MEDIUM' }> {
    const byRating = new Map<string, Map<string, number[]>>();
    for (const l of lines ?? []) {
      if (!l.performanceRating || !l.demographic) continue;
      const groups = byRating.get(l.performanceRating) ?? new Map<string, number[]>();
      (groups.get(l.demographic) ?? groups.set(l.demographic, []).get(l.demographic)!).push(Number(l.proposedPct));
      byRating.set(l.performanceRating, groups);
    }
    const alerts = [];
    for (const [rating, groups] of byRating) {
      const rows = [...groups.entries()].map(([demographic, pcts]) => ({ demographic, avgPct: r2(mean(pcts)), n: pcts.length }));
      if (rows.length < 2) continue;
      const gap = r2(Math.max(...rows.map((r) => r.avgPct)) - Math.min(...rows.map((r) => r.avgPct)));
      if (gap > thresholdPct) alerts.push({ rating, groups: rows, gap, severity: gap > thresholdPct * 2 ? 'HIGH' as const : 'MEDIUM' as const });
    }
    return alerts.sort((a, b) => b.gap - a.gap);
  }

  // ─── Merit distribution summary ───────────────────────────────

  static distribution(lines: MeritLineSignal[]): { count: number; mean: number; median: number; stddev: number; min: number; max: number } {
    const pcts = (lines ?? []).map((l) => Number(l.proposedPct));
    if (!pcts.length) return { count: 0, mean: 0, median: 0, stddev: 0, min: 0, max: 0 };
    return { count: pcts.length, mean: r2(mean(pcts)), median: r2(median(pcts)), stddev: r2(stddev(pcts)), min: Math.min(...pcts), max: Math.max(...pcts) };
  }

  // ─── WFM staffing recommendations ─────────────────────────────

  /**
   * Compare demand to scheduled headcount per slot and recommend an action:
   * ADD n (understaffed), RELEASE n (overstaffed), or OK.
   */
  static staffingRecommendations(demand: DemandSlot[], scheduled: ScheduledSlot[]): Array<{ slot: string; required: number; scheduled: number; gap: number; action: string }> {
    const schedBySlot = new Map(scheduled.map((s) => [s.slot, Number(s.headcount)]));
    const slots = new Set<string>([...demand.map((d) => d.slot), ...scheduled.map((s) => s.slot)]);
    const out = [];
    for (const slot of slots) {
      const required = Number(demand.find((d) => d.slot === slot)?.requiredHeadcount ?? 0);
      const sched = schedBySlot.get(slot) ?? 0;
      const gap = sched - required;
      const action = gap < 0 ? `ADD ${-gap}` : gap > 0 ? `RELEASE ${gap}` : 'OK';
      out.push({ slot, required, scheduled: sched, gap, action });
    }
    return out.sort((a, b) => a.gap - b.gap); // most understaffed first
  }

  /** Flag employees whose projected weekly hours exceed a threshold (OT risk). */
  static overtimeRisk(assignments: Array<{ employeeId: string; hours: number }>, weeklyThreshold = 40): Array<{ employeeId: string; hours: number; overBy: number }> {
    const byEmp = new Map<string, number>();
    for (const a of assignments ?? []) byEmp.set(a.employeeId, (byEmp.get(a.employeeId) ?? 0) + Number(a.hours));
    return [...byEmp.entries()]
      .filter(([, h]) => h > weeklyThreshold)
      .map(([employeeId, hours]) => ({ employeeId, hours: r2(hours), overBy: r2(hours - weeklyThreshold) }))
      .sort((a, b) => b.overBy - a.overBy);
  }

  // Instance wrappers (controller-facing).
  meritOutliers(lines: MeritLineSignal[], z?: number) { return AiInsightsService.meritOutliers(lines, z); }
  biasAlerts(lines: MeritLineSignal[], threshold?: number) { return AiInsightsService.biasAlerts(lines, threshold); }
  distribution(lines: MeritLineSignal[]) { return AiInsightsService.distribution(lines); }
  staffingRecommendations(demand: DemandSlot[], scheduled: ScheduledSlot[]) { return AiInsightsService.staffingRecommendations(demand, scheduled); }
  overtimeRisk(assignments: Array<{ employeeId: string; hours: number }>, threshold?: number) { return AiInsightsService.overtimeRisk(assignments, threshold); }
}
