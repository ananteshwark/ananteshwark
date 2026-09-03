import { BadRequestException } from '@nestjs/common';
import { ExpenseEcosystemService } from './expense-ecosystem.service';
import { FeedPullAdapter } from './feed-pull.adapter';
import { CardTxnStatus, TripStatus } from './entities/ecosystem.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('ExpenseEcosystemService', () => {
  let service: ExpenseEcosystemService;
  let feedRepo: any, txnRepo: any, tripRepo: any, pull: FeedPullAdapter, automation: any;

  beforeEach(() => {
    feedRepo = mockRepo(); txnRepo = mockRepo(); tripRepo = mockRepo();
    pull = new FeedPullAdapter();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new ExpenseEcosystemService(feedRepo, txnRepo, tripRepo, pull, automation);
  });

  describe('feeds & transactions', () => {
    it('registers a feed and rejects a bad card number', async () => {
      const feed = await service.registerFeed('t1', { provider: 'amex', cardLast4: '1234' });
      expect(feed).toMatchObject({ provider: 'amex', cardLast4: '1234' });
      await expect(service.registerFeed('t1', { provider: 'amex', cardLast4: '12' })).rejects.toThrow(BadRequestException);
    });

    it('ingests a transaction and dedupes by external ref', async () => {
      feedRepo.findOne.mockResolvedValue({ id: 'f1', tenantId: 't1', currency: 'USD' });
      txnRepo.findOne.mockResolvedValueOnce(null);
      const first = await service.ingestTransaction('t1', 'f1', { externalRef: 'x1', postedDate: '2026-07-06', merchant: 'Cafe', amount: 12.5 });
      expect(first.duplicate).toBe(false);
      txnRepo.findOne.mockResolvedValueOnce({ id: 'e1', externalRef: 'x1' });
      const dup = await service.ingestTransaction('t1', 'f1', { externalRef: 'x1', postedDate: '2026-07-06', merchant: 'Cafe', amount: 12.5 });
      expect(dup.duplicate).toBe(true);
    });

    it('matching emits an event; reconcile requires a matched txn', async () => {
      txnRepo.findOne.mockResolvedValue({ id: 'x1', tenantId: 't1', amount: 12.5, status: CardTxnStatus.UNMATCHED });
      const m = await service.matchTransaction('t1', 'x1', 'exp1');
      expect(m).toMatchObject({ status: CardTxnStatus.MATCHED, matchedExpenseId: 'exp1' });
      expect(automation.emit).toHaveBeenCalledWith('t1', 'card.transaction_matched', expect.objectContaining({ expenseId: 'exp1' }));

      txnRepo.findOne.mockResolvedValue({ id: 'x2', tenantId: 't1', status: CardTxnStatus.UNMATCHED });
      await expect(service.reconcile('t1', 'x2')).rejects.toThrow(BadRequestException);
    });
  });

  describe('autoMatch (pure)', () => {
    it('matches by amount tolerance and closest date, one expense per txn', () => {
      const txns = [
        { id: 't-a', amount: 100, postedDate: '2026-07-06' },
        { id: 't-b', amount: 50, postedDate: '2026-07-10' },
      ];
      const candidates = [
        { id: 'e1', amount: 100, date: '2026-07-05' }, // 1 day from t-a
        { id: 'e2', amount: 100, date: '2026-07-08' }, // 2 days from t-a (further)
        { id: 'e3', amount: 50, date: '2026-07-20' },  // 10 days from t-b → outside window
      ];
      const res = ExpenseEcosystemService.autoMatch(txns, candidates, { dateWindowDays: 3 });
      expect(res.find((r) => r.transactionId === 't-a')!.expenseId).toBe('e1'); // closest date
      expect(res.find((r) => r.transactionId === 't-b')!.expenseId).toBeNull(); // e3 outside window
    });

    it('does not reuse a claimed candidate', () => {
      const txns = [{ id: 't1', amount: 100, postedDate: '2026-07-06' }, { id: 't2', amount: 100, postedDate: '2026-07-06' }];
      const candidates = [{ id: 'e1', amount: 100, date: '2026-07-06' }];
      const res = ExpenseEcosystemService.autoMatch(txns, candidates);
      expect(res[0].expenseId).toBe('e1');
      expect(res[1].expenseId).toBeNull();
    });
  });

  describe('runAutoMatch', () => {
    it('persists matches and counts them', async () => {
      txnRepo.find.mockResolvedValue([{ id: 't1', amount: 100, postedDate: '2026-07-06' }]);
      txnRepo.findOne.mockResolvedValue({ id: 't1', tenantId: 't1', amount: 100, status: CardTxnStatus.UNMATCHED });
      const res = await service.runAutoMatch('t1', 'f1', [{ id: 'e1', amount: 100, date: '2026-07-06' }]);
      expect(res.matched).toBe(1);
    });
  });

  describe('trips', () => {
    it('imports a trip and links it to a travel request', async () => {
      tripRepo.findOne.mockResolvedValue(null);
      const { trip } = await service.ingestTrip('t1', { externalRef: 'ride1', tripDate: '2026-07-06', amount: 22, fromLocation: 'A', toLocation: 'B' });
      expect(trip.status).toBe(TripStatus.IMPORTED);

      tripRepo.findOne.mockResolvedValue({ id: 'trip1', tenantId: 't1' });
      const linked = await service.linkTrip('t1', 'trip1', 'tr1');
      expect(linked).toMatchObject({ travelRequestId: 'tr1', status: TripStatus.LINKED });
    });
  });
});
