import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SourcingService } from './sourcing.service';
import { SourcingEvent, SourcingEventType, SourcingEventStatus, BidVisibility } from './entities/sourcing-event.entity';
import { SourcingEventLine } from './entities/sourcing-event-line.entity';
import { SourcingBid } from './entities/sourcing-bid.entity';
import { SourcingAward } from './entities/sourcing-award.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
  remove: jest.fn().mockResolvedValue(undefined),
});

describe('SourcingService — Phase 198-201', () => {
  let service: SourcingService;
  let eventRepo: any, lineRepo: any, bidRepo: any, awardRepo: any;

  beforeEach(async () => {
    eventRepo = mockRepo(); lineRepo = mockRepo(); bidRepo = mockRepo(); awardRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        SourcingService,
        { provide: getRepositoryToken(SourcingEvent), useValue: eventRepo },
        { provide: getRepositoryToken(SourcingEventLine), useValue: lineRepo },
        { provide: getRepositoryToken(SourcingBid), useValue: bidRepo },
        { provide: getRepositoryToken(SourcingAward), useValue: awardRepo },
      ],
    }).compile();
    service = module.get(SourcingService);
  });

  // ─── Ph-198: events ───────────────────────────────────────────────

  it('createEvent — generates sequential event number', async () => {
    eventRepo.count.mockResolvedValue(4);
    const e = await service.createEvent('t1', { title: 'Steel RFQ' });
    expect(eventRepo.create).toHaveBeenCalledWith(expect.objectContaining({ eventNumber: 'SRC-00005', status: SourcingEventStatus.DRAFT }));
    expect(e).toBeDefined();
  });

  it('createEvent — rejects zero-sum weights', async () => {
    await expect(service.createEvent('t1', { title: 'X', weightPrice: 0, weightQuality: 0, weightDelivery: 0 })).rejects.toThrow(BadRequestException);
  });

  it('addLine — blocked once event is not DRAFT', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', status: SourcingEventStatus.BIDDING });
    await expect(service.addLine('t1', 'e1', { description: 'Item' })).rejects.toThrow(BadRequestException);
  });

  it('publish — requires at least one line', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', status: SourcingEventStatus.DRAFT });
    lineRepo.count.mockResolvedValue(0);
    await expect(service.publish('t1', 'e1')).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-199: bids + auction + re-round ────────────────────────────

  it('submitBid — auction bid must beat prior best', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', status: SourcingEventStatus.BIDDING, eventType: SourcingEventType.AUCTION, currentRound: 2 });
    lineRepo.findOne.mockResolvedValue({ id: 'l1' });
    bidRepo.find.mockResolvedValue([{ unitPrice: 100 }]);
    await expect(service.submitBid('t1', 'e1', { lineId: 'l1', supplierId: 's1', unitPrice: 100 })).rejects.toThrow(BadRequestException);
  });

  it('submitBid — records the current round', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', status: SourcingEventStatus.BIDDING, eventType: SourcingEventType.RFQ, currentRound: 3 });
    lineRepo.findOne.mockResolvedValue({ id: 'l1' });
    await service.submitBid('t1', 'e1', { lineId: 'l1', supplierId: 's1', unitPrice: 50 });
    expect(bidRepo.create).toHaveBeenCalledWith(expect.objectContaining({ round: 3 }));
  });

  it('startNextRound — increments round and reopens bidding', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', status: SourcingEventStatus.SCORING, currentRound: 1 });
    eventRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const e = await service.startNextRound('t1', 'e1');
    expect(e.currentRound).toBe(2);
    expect(e.status).toBe(SourcingEventStatus.BIDDING);
  });

  // ─── Ph-200: scoring & award ──────────────────────────────────────

  it('scoreLine — ranks cheapest/fastest bid first', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', weightPrice: 0.6, weightQuality: 0.2, weightDelivery: 0.2 });
    lineRepo.findOne.mockResolvedValue({ id: 'l1' });
    bidRepo.find.mockResolvedValue([
      { supplierId: 's1', round: 1, unitPrice: 100, leadTimeDays: 10, qualityScore: 80, submittedAt: new Date('2026-01-01') },
      { supplierId: 's2', round: 1, unitPrice: 120, leadTimeDays: 20, qualityScore: 90, submittedAt: new Date('2026-01-01') },
    ]);
    const r = await service.scoreLine('t1', 'e1', 'l1');
    expect(r.recommendation.supplierId).toBe('s1');
    expect(r.ranked[0].priceScore).toBe(100);
  });

  it('scoreLine — uses only the latest round per supplier', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', weightPrice: 1, weightQuality: 0, weightDelivery: 0 });
    lineRepo.findOne.mockResolvedValue({ id: 'l1' });
    bidRepo.find.mockResolvedValue([
      { supplierId: 's1', round: 1, unitPrice: 100, leadTimeDays: 10, qualityScore: 50, submittedAt: new Date('2026-01-01') },
      { supplierId: 's1', round: 2, unitPrice: 80, leadTimeDays: 10, qualityScore: 50, submittedAt: new Date('2026-01-02') },
    ]);
    const r = await service.scoreLine('t1', 'e1', 'l1');
    expect(r.ranked).toHaveLength(1);
    expect(r.ranked[0].unitPrice).toBe(80);
  });

  it('awardLine — rejects split not summing to 100', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', status: SourcingEventStatus.SCORING });
    lineRepo.findOne.mockResolvedValue({ id: 'l1', quantity: 100 });
    await expect(service.awardLine('t1', 'e1', 'l1', [
      { supplierId: 's1', unitPrice: 10, splitPct: 60 },
      { supplierId: 's2', unitPrice: 11, splitPct: 30 },
    ])).rejects.toThrow(BadRequestException);
  });

  it('awardLine — splits awarded quantity by percentage', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', status: SourcingEventStatus.BIDDING });
    eventRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    lineRepo.findOne.mockResolvedValue({ id: 'l1', quantity: 100 });
    awardRepo.find.mockResolvedValue([]);
    awardRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.awardLine('t1', 'e1', 'l1', [
      { supplierId: 's1', unitPrice: 10, splitPct: 70 },
      { supplierId: 's2', unitPrice: 11, splitPct: 30 },
    ]);
    expect(r[0].awardedQty).toBe(70);
    expect(r[1].awardedQty).toBe(30);
  });

  // ─── Ph-201: award-to-PO ──────────────────────────────────────────

  it('awardToPo — groups awards into one PO proposal per supplier', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', eventNumber: 'SRC-00001', currency: 'USD', status: SourcingEventStatus.SCORING });
    eventRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    awardRepo.find.mockResolvedValue([
      { id: 'a1', lineId: 'l1', supplierId: 's1', awardedQty: 70, unitPrice: 10, poRef: null },
      { id: 'a2', lineId: 'l2', supplierId: 's1', awardedQty: 5, unitPrice: 20, poRef: null },
      { id: 'a3', lineId: 'l1', supplierId: 's2', awardedQty: 30, unitPrice: 11, poRef: null },
    ]);
    lineRepo.find.mockResolvedValue([{ id: 'l1', description: 'Bolt' }, { id: 'l2', description: 'Nut' }]);
    awardRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.awardToPo('t1', 'e1');
    expect(r.proposals).toHaveLength(2);
    const s1 = r.proposals.find((p: any) => p.supplierId === 's1');
    expect(s1.total).toBe(800); // 70*10 + 5*20
    expect(s1.lines).toHaveLength(2);
  });

  it('awardToPo — throws when no awards exist', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', eventNumber: 'SRC-1' });
    awardRepo.find.mockResolvedValue([]);
    await expect(service.awardToPo('t1', 'e1')).rejects.toThrow(BadRequestException);
  });
});
