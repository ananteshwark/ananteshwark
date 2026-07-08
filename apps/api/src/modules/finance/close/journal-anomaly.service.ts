import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { JournalEntry } from '../gl/entities/journal-entry.entity';
import { JournalLine } from '../gl/entities/journal-line.entity';

export type AnomalySeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface JournalAnomaly {
  check: string;
  severity: AnomalySeverity;
  entryId: string;
  entryNumber: string;
  date: string;
  detail: string;
}

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

/**
 * Continuous-close style anomaly screening over posted journals: instead of
 * sampling entries at period end, every entry in the window is scored
 * against a set of red-flag heuristics auditors actually use. Pure
 * statistics over existing data — no configuration required to start.
 */
@Injectable()
export class JournalAnomalyService {
  constructor(
    @InjectRepository(JournalEntry) private readonly entryRepo: Repository<JournalEntry>,
    @InjectRepository(JournalLine) private readonly lineRepo: Repository<JournalLine>,
  ) {}

  async scan(tenantId: string, from: string, to: string): Promise<{
    period: { from: string; to: string };
    entriesScanned: number;
    anomalies: JournalAnomaly[];
    summary: Record<string, number>;
  }> {
    const entries = await this.entryRepo.find({
      where: { tenantId, date: Between(from, to) },
      order: { date: 'ASC' },
    });
    const scanned = entries.filter((e) => String(e.status) !== 'DRAFT');
    const lines = scanned.length
      ? await this.lineRepo.find({ where: { tenantId } })
      : [];

    const anomalies: JournalAnomaly[] = [
      ...this.duplicateEntries(scanned),
      ...this.weekendPostings(scanned),
      ...this.roundSumEntries(scanned),
      ...this.amountOutliers(scanned, lines),
      ...this.rareAccounts(scanned, lines),
    ];

    // Highest severity first, then by date.
    const rank: Record<AnomalySeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    anomalies.sort((a, b) => rank[a.severity] - rank[b.severity] || a.date.localeCompare(b.date));

    const summary: Record<string, number> = {};
    for (const a of anomalies) summary[a.check] = (summary[a.check] ?? 0) + 1;

    return { period: { from, to }, entriesScanned: scanned.length, anomalies, summary };
  }

  /** Same reference AND same total on different entries — classic double posting. */
  private duplicateEntries(entries: JournalEntry[]): JournalAnomaly[] {
    const seen = new Map<string, JournalEntry>();
    const anomalies: JournalAnomaly[] = [];
    for (const entry of entries) {
      const reference = (entry as any).reference;
      if (!reference) continue;
      const key = `${reference}|${round2(Number(entry.totalDebit))}`;
      const first = seen.get(key);
      if (first) {
        anomalies.push({
          check: 'DUPLICATE_REFERENCE',
          severity: 'HIGH',
          entryId: entry.id,
          entryNumber: (entry as any).entryNumber,
          date: entry.date,
          detail: `Same reference "${reference}" and amount ${round2(Number(entry.totalDebit))} as ${(first as any).entryNumber}`,
        });
      } else {
        seen.set(key, entry);
      }
    }
    return anomalies;
  }

  /** Manual entries posted on Saturday/Sunday. */
  private weekendPostings(entries: JournalEntry[]): JournalAnomaly[] {
    return entries
      .filter((e) => {
        const day = new Date(`${e.date}T00:00:00Z`).getUTCDay();
        return (day === 0 || day === 6) && String((e as any).source) === 'MANUAL';
      })
      .map((e) => ({
        check: 'WEEKEND_POSTING',
        severity: 'LOW' as const,
        entryId: e.id,
        entryNumber: (e as any).entryNumber,
        date: e.date,
        detail: 'Manual journal dated on a weekend',
      }));
  }

  /** Large, suspiciously round totals on manual entries (10k+, ends in 000). */
  private roundSumEntries(entries: JournalEntry[]): JournalAnomaly[] {
    return entries
      .filter((e) => {
        const total = Number(e.totalDebit);
        return String((e as any).source) === 'MANUAL' && total >= 10000 && total % 1000 === 0;
      })
      .map((e) => ({
        check: 'ROUND_SUM',
        severity: 'MEDIUM' as const,
        entryId: e.id,
        entryNumber: (e as any).entryNumber,
        date: e.date,
        detail: `Manual entry with a round total of ${round2(Number(e.totalDebit))}`,
      }));
  }

  /**
   * Per-account amount outliers: a line more than 3 standard deviations above
   * that account's own mean line size (needs ≥ 5 historical lines to judge).
   */
  private amountOutliers(entries: JournalEntry[], lines: JournalLine[]): JournalAnomaly[] {
    const entryMap = new Map(entries.map((e) => [e.id, e]));
    const byAccount = new Map<string, number[]>();
    for (const line of lines) {
      const magnitude = Math.max(Number((line as any).debit ?? 0), Number((line as any).credit ?? 0));
      if (magnitude <= 0) continue;
      (byAccount.get((line as any).accountId) ?? byAccount.set((line as any).accountId, []).get((line as any).accountId)!)
        .push(magnitude);
    }
    const stats = new Map<string, { mean: number; std: number; n: number }>();
    for (const [accountId, values] of byAccount) {
      const n = values.length;
      const mean = values.reduce((s, v) => s + v, 0) / n;
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
      stats.set(accountId, { mean, std: Math.sqrt(variance), n });
    }

    const anomalies: JournalAnomaly[] = [];
    const flagged = new Set<string>();
    for (const line of lines) {
      const entry = entryMap.get((line as any).journalEntryId);
      if (!entry) continue; // line outside the scan window
      const stat = stats.get((line as any).accountId);
      if (!stat || stat.n < 5 || stat.std === 0) continue;
      const magnitude = Math.max(Number((line as any).debit ?? 0), Number((line as any).credit ?? 0));
      const z = (magnitude - stat.mean) / stat.std;
      const key = `${entry.id}|${(line as any).accountId}`;
      if (z > 3 && !flagged.has(key)) {
        flagged.add(key);
        anomalies.push({
          check: 'AMOUNT_OUTLIER',
          severity: 'HIGH',
          entryId: entry.id,
          entryNumber: (entry as any).entryNumber,
          date: entry.date,
          detail: `Line of ${round2(magnitude)} is ${z.toFixed(1)}σ above this account's average of ${round2(stat.mean)}`,
        });
      }
    }
    return anomalies;
  }

  /** Postings to accounts that almost never see activity (≤ 2 lines ever). */
  private rareAccounts(entries: JournalEntry[], lines: JournalLine[]): JournalAnomaly[] {
    const entryMap = new Map(entries.map((e) => [e.id, e]));
    const usage = new Map<string, number>();
    for (const line of lines) {
      usage.set((line as any).accountId, (usage.get((line as any).accountId) ?? 0) + 1);
    }
    const anomalies: JournalAnomaly[] = [];
    const flagged = new Set<string>();
    for (const line of lines) {
      const entry = entryMap.get((line as any).journalEntryId);
      if (!entry) continue;
      const count = usage.get((line as any).accountId) ?? 0;
      const key = `${entry.id}|${(line as any).accountId}`;
      if (count <= 2 && !flagged.has(key)) {
        flagged.add(key);
        anomalies.push({
          check: 'RARE_ACCOUNT',
          severity: 'MEDIUM',
          entryId: entry.id,
          entryNumber: (entry as any).entryNumber,
          date: entry.date,
          detail: `Posting to an account with only ${count} line(s) of history`,
        });
      }
    }
    return anomalies;
  }
}
