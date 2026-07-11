import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CardFeed, CardTransaction, CardTxnStatus, TripImport, TripSource, TripStatus,
} from './entities/ecosystem.entity';
import { FeedPullAdapter } from './feed-pull.adapter';
import { AutomationService } from '../../automation/automation.service';

export interface ExpenseCandidate { id: string; amount: number; date: string }

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
}

@Injectable()
export class ExpenseEcosystemService {
  constructor(
    @InjectRepository(CardFeed) private readonly feedRepo: Repository<CardFeed>,
    @InjectRepository(CardTransaction) private readonly txnRepo: Repository<CardTransaction>,
    @InjectRepository(TripImport) private readonly tripRepo: Repository<TripImport>,
    private readonly pull: FeedPullAdapter,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Card feeds ───────────────────────────────────────────────

  async registerFeed(tenantId: string, dto: { provider: string; cardLast4: string; holderEmployeeId?: string; currency?: string }): Promise<CardFeed> {
    if (!dto.provider?.trim() || !/^\d{4}$/.test(dto.cardLast4 ?? '')) throw new BadRequestException('provider and a 4-digit cardLast4 are required');
    return this.feedRepo.save(this.feedRepo.create({
      tenantId, provider: dto.provider.trim(), cardLast4: dto.cardLast4, holderEmployeeId: dto.holderEmployeeId ?? null,
      currency: dto.currency ?? 'USD', active: true,
    }));
  }

  listFeeds(tenantId: string): Promise<CardFeed[]> {
    return this.feedRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  /** Ingest a card transaction idempotently (dedup by externalRef). */
  async ingestTransaction(tenantId: string, feedId: string, dto: { externalRef: string; postedDate: string; merchant: string; amount: number; currency?: string }): Promise<{ transaction: CardTransaction; duplicate: boolean }> {
    const feed = await this.feedRepo.findOne({ where: { id: feedId, tenantId } });
    if (!feed) throw new NotFoundException(`Card feed ${feedId} not found`);
    if (!dto.externalRef || !dto.postedDate || dto.amount == null) throw new BadRequestException('externalRef, postedDate and amount are required');
    const existing = await this.txnRepo.findOne({ where: { tenantId, externalRef: dto.externalRef } });
    if (existing) return { transaction: existing, duplicate: true };
    const transaction = await this.txnRepo.save(this.txnRepo.create({
      tenantId, feedId, externalRef: dto.externalRef, postedDate: dto.postedDate, merchant: dto.merchant ?? '(unknown)',
      amount: Number(dto.amount), currency: dto.currency ?? feed.currency, status: CardTxnStatus.UNMATCHED,
    }));
    return { transaction, duplicate: false };
  }

  listTransactions(tenantId: string, filter: { feedId?: string; status?: CardTxnStatus }): Promise<CardTransaction[]> {
    const where: any = { tenantId };
    if (filter.feedId) where.feedId = filter.feedId;
    if (filter.status) where.status = filter.status;
    return this.txnRepo.find({ where, order: { postedDate: 'DESC' } });
  }

  async matchTransaction(tenantId: string, txnId: string, expenseId: string): Promise<CardTransaction> {
    const txn = await this.txnRepo.findOne({ where: { id: txnId, tenantId } });
    if (!txn) throw new NotFoundException(`Transaction ${txnId} not found`);
    txn.status = CardTxnStatus.MATCHED;
    txn.matchedExpenseId = expenseId;
    const saved = await this.txnRepo.save(txn);
    await this.automation?.emit(tenantId, 'card.transaction_matched', { transactionId: txnId, expenseId, amount: Number(txn.amount) });
    return saved;
  }

  async reconcile(tenantId: string, txnId: string): Promise<CardTransaction> {
    const txn = await this.txnRepo.findOne({ where: { id: txnId, tenantId } });
    if (!txn) throw new NotFoundException(`Transaction ${txnId} not found`);
    if (txn.status !== CardTxnStatus.MATCHED) throw new BadRequestException('Only matched transactions can be reconciled');
    txn.status = CardTxnStatus.RECONCILED;
    return this.txnRepo.save(txn);
  }

  /**
   * Auto-match a set of card transactions to candidate expenses by amount
   * (within `amountTolerance`) and date proximity (within `dateWindowDays`),
   * choosing the closest-dated candidate. Pure and deterministic.
   */
  static autoMatch(
    transactions: Array<{ id: string; amount: number; postedDate: string }>,
    candidates: ExpenseCandidate[],
    opts: { amountTolerance?: number; dateWindowDays?: number } = {},
  ): Array<{ transactionId: string; expenseId: string | null; dateGap: number | null }> {
    const tol = opts.amountTolerance ?? 0.01;
    const window = opts.dateWindowDays ?? 3;
    const claimed = new Set<string>();
    const out = [];
    for (const txn of transactions) {
      const matches = candidates
        .filter((c) => !claimed.has(c.id) && Math.abs(Number(c.amount) - Number(txn.amount)) <= tol && daysBetween(c.date, txn.postedDate) <= window)
        .map((c) => ({ c, gap: daysBetween(c.date, txn.postedDate) }))
        .sort((a, b) => a.gap - b.gap);
      if (matches.length) {
        claimed.add(matches[0].c.id);
        out.push({ transactionId: txn.id, expenseId: matches[0].c.id, dateGap: Math.round(matches[0].gap) });
      } else {
        out.push({ transactionId: txn.id, expenseId: null, dateGap: null });
      }
    }
    return out;
  }

  /** Run auto-match over a feed's unmatched transactions and persist the matches. */
  async runAutoMatch(tenantId: string, feedId: string, candidates: ExpenseCandidate[], opts?: { amountTolerance?: number; dateWindowDays?: number }): Promise<{ matched: number; results: Array<{ transactionId: string; expenseId: string | null }> }> {
    const txns = await this.txnRepo.find({ where: { tenantId, feedId, status: CardTxnStatus.UNMATCHED } });
    const results = ExpenseEcosystemService.autoMatch(txns.map((t) => ({ id: t.id, amount: Number(t.amount), postedDate: t.postedDate })), candidates, opts);
    let matched = 0;
    for (const r of results) {
      if (r.expenseId) { await this.matchTransaction(tenantId, r.transactionId, r.expenseId); matched++; }
    }
    return { matched, results };
  }

  // ─── Trips (TMS / cab) ────────────────────────────────────────

  async ingestTrip(tenantId: string, dto: { source?: TripSource; externalRef: string; employeeId?: string; tripDate: string; fromLocation?: string; toLocation?: string; amount: number; currency?: string }): Promise<{ trip: TripImport; duplicate: boolean }> {
    if (!dto.externalRef || !dto.tripDate || dto.amount == null) throw new BadRequestException('externalRef, tripDate and amount are required');
    const existing = await this.tripRepo.findOne({ where: { tenantId, externalRef: dto.externalRef } });
    if (existing) return { trip: existing, duplicate: true };
    const trip = await this.tripRepo.save(this.tripRepo.create({
      tenantId, source: dto.source ?? TripSource.OTHER, externalRef: dto.externalRef, employeeId: dto.employeeId ?? null,
      tripDate: dto.tripDate, fromLocation: dto.fromLocation ?? null, toLocation: dto.toLocation ?? null,
      amount: Number(dto.amount), currency: dto.currency ?? 'USD', status: TripStatus.IMPORTED,
    }));
    return { trip, duplicate: false };
  }

  listTrips(tenantId: string, employeeId?: string): Promise<TripImport[]> {
    const where: any = { tenantId };
    if (employeeId) where.employeeId = employeeId;
    return this.tripRepo.find({ where, order: { tripDate: 'DESC' } });
  }

  async linkTrip(tenantId: string, tripId: string, travelRequestId: string): Promise<TripImport> {
    const trip = await this.tripRepo.findOne({ where: { id: tripId, tenantId } });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    trip.travelRequestId = travelRequestId;
    trip.status = TripStatus.LINKED;
    return this.tripRepo.save(trip);
  }
}
