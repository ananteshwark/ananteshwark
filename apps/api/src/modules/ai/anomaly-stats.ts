/**
 * Statistical primitives shared by every module's anomaly detector — the
 * scoring core of the AI layer. Pure functions, deterministic, no deps.
 */

export interface OutlierHit<T> {
  item: T;
  value: number;
  z: number;
  mean: number;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

export function std(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

export function groupBy<T>(items: T[], keyOf: (item: T) => string | null | undefined): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key == null) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(item);
  }
  return groups;
}

/**
 * Per-group z-score outliers: within each group (an account, an employee, a
 * vendor…), values more than `threshold` standard deviations above the
 * group's own mean. Groups need `minSamples` points before we judge — small
 * histories produce noise, not signal.
 */
export function groupOutliers<T>(
  items: T[],
  keyOf: (item: T) => string | null | undefined,
  valueOf: (item: T) => number,
  { threshold = 3, minSamples = 5 } = {},
): OutlierHit<T>[] {
  const hits: OutlierHit<T>[] = [];
  for (const [, group] of groupBy(items, keyOf)) {
    if (group.length < minSamples) continue;
    const values = group.map(valueOf);
    const m = mean(values);
    const s = std(values);
    if (s === 0) continue;
    for (const item of group) {
      const value = valueOf(item);
      const z = (value - m) / s;
      if (z > threshold) hits.push({ item, value, z, mean: m });
    }
  }
  return hits;
}

/** Groups of ≥2 items sharing an exact composite key — likely duplicates. */
export function duplicateGroups<T>(items: T[], keyOf: (item: T) => string | null | undefined): T[][] {
  return Array.from(groupBy(items, keyOf).values()).filter((group) => group.length >= 2);
}

/**
 * Volume spike: recent daily rate vs baseline daily rate. Returns the ratio
 * (Infinity if the baseline is silent but recent isn't), or 0 when there is
 * nothing recent.
 */
export function spikeRatio(recentCount: number, recentDays: number, baselineCount: number, baselineDays: number): number {
  const recentRate = recentDays > 0 ? recentCount / recentDays : 0;
  const baselineRate = baselineDays > 0 ? baselineCount / baselineDays : 0;
  if (recentRate === 0) return 0;
  if (baselineRate === 0) return Number.POSITIVE_INFINITY;
  return recentRate / baselineRate;
}

export const round2 = (n: number) => Math.round(Number(n) * 100) / 100;
