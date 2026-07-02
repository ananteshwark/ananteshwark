import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SequenceService } from '../../../common/sequence/sequence.service';
import { SourcingEvent, SourcingEventType, SourcingEventStatus, BidVisibility } from './entities/sourcing-event.entity';
import { SourcingEventLine } from './entities/sourcing-event-line.entity';
import { SourcingBid } from './entities/sourcing-bid.entity';
import { SourcingAward } from './entities/sourcing-award.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class SourcingService {
  constructor(
    @InjectRepository(SourcingEvent) private readonly eventRepo: Repository<SourcingEvent>,
    @InjectRepository(SourcingEventLine) private readonly lineRepo: Repository<SourcingEventLine>,
    @InjectRepository(SourcingBid) private readonly bidRepo: Repository<SourcingBid>,
    @InjectRepository(SourcingAward) private readonly awardRepo: Repository<SourcingAward>,
    private readonly sequence: SequenceService,
  ) {}

  async updateEvent(tenantId: string, id: string, dto: any): Promise<SourcingEvent> {
    const event = await this.eventRepo.findOne({ where: { id, tenantId } });
    if (!event) throw new NotFoundException(`Sourcing event ${id} not found`);
    if (event.status !== SourcingEventStatus.DRAFT) throw new BadRequestException('Only DRAFT events can be edited');
    const { tenantId: _t, id: _i, status: _s, ...rest } = dto ?? {};
    Object.assign(event, rest);
    return this.eventRepo.save(event);
  }

  // ─── Ph-198: event types ──────────────────────────────────────────

  listEvents(tenantId: string): Promise<SourcingEvent[]> {
    return this.eventRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async createEvent(tenantId: string, data: {
    eventType?: SourcingEventType; title: string; description?: string; visibility?: BidVisibility;
    weightPrice?: number; weightQuality?: number; weightDelivery?: number; openDate?: string; closeDate?: string; currency?: string;
  }): Promise<SourcingEvent> {
    if (!data.title?.trim()) throw new BadRequestException('title is required');
    const wP = data.weightPrice ?? 0.6, wQ = data.weightQuality ?? 0.2, wD = data.weightDelivery ?? 0.2;
    const sum = round2(wP + wQ + wD);
    if (sum <= 0) throw new BadRequestException('weights must sum to a positive value');
    const eventNumber = await this.sequence.formatted(tenantId, 'sourcing-event', 'SRC-', 5);
    const e = this.eventRepo.create({
      tenantId, eventNumber, eventType: data.eventType ?? SourcingEventType.RFQ, title: data.title,
      description: data.description ?? null, status: SourcingEventStatus.DRAFT,
      visibility: data.visibility ?? BidVisibility.SEALED, currentRound: 1,
      weightPrice: wP, weightQuality: wQ, weightDelivery: wD,
      openDate: data.openDate ?? null, closeDate: data.closeDate ?? null, currency: data.currency ?? 'USD',
    } as any) as unknown as SourcingEvent;
    return (this.eventRepo.save(e) as unknown) as Promise<SourcingEvent>;
  }

  async addLine(tenantId: string, eventId: string, data: { itemCode?: string; description: string; quantity?: number; uom?: string; targetPrice?: number }): Promise<SourcingEventLine> {
    const event = await this.getEvent(tenantId, eventId);
    if (event.status !== SourcingEventStatus.DRAFT) throw new BadRequestException('Lines can only be added while the event is DRAFT');
    if (!data.description?.trim()) throw new BadRequestException('description is required');
    const count = await this.lineRepo.count({ where: { tenantId, eventId } });
    const l = this.lineRepo.create({
      tenantId, eventId, lineNo: count + 1, itemCode: data.itemCode ?? null, description: data.description,
      quantity: data.quantity ?? 1, uom: data.uom ?? 'EA', targetPrice: data.targetPrice ?? 0,
    } as any) as unknown as SourcingEventLine;
    return (this.lineRepo.save(l) as unknown) as Promise<SourcingEventLine>;
  }

  listLines(tenantId: string, eventId: string): Promise<SourcingEventLine[]> {
    return this.lineRepo.find({ where: { tenantId, eventId }, order: { lineNo: 'ASC' } });
  }

  async publish(tenantId: string, eventId: string): Promise<SourcingEvent> {
    const event = await this.getEvent(tenantId, eventId);
    if (event.status !== SourcingEventStatus.DRAFT) throw new BadRequestException('Only DRAFT events can be published');
    const lines = await this.lineRepo.count({ where: { tenantId, eventId } });
    if (lines === 0) throw new BadRequestException('Add at least one line before publishing');
    event.status = SourcingEventStatus.BIDDING;
    return (this.eventRepo.save(event) as unknown) as Promise<SourcingEvent>;
  }

  // ─── Ph-199: supplier bids + re-round ─────────────────────────────

  async submitBid(tenantId: string, eventId: string, data: {
    lineId: string; supplierId: string; unitPrice: number; leadTimeDays?: number; qualityScore?: number; notes?: string;
  }): Promise<SourcingBid> {
    const event = await this.getEvent(tenantId, eventId);
    if (event.status !== SourcingEventStatus.BIDDING) throw new BadRequestException('Event is not accepting bids');
    const line = await this.lineRepo.findOne({ where: { id: data.lineId, tenantId, eventId } });
    if (!line) throw new NotFoundException('Event line not found');
    if (data.unitPrice == null || data.unitPrice < 0) throw new BadRequestException('unitPrice must be >= 0');
    // For a reverse auction, a new bid must beat the supplier's prior-round price on this line.
    if (event.eventType === SourcingEventType.AUCTION) {
      const prior = await this.bidRepo.find({ where: { tenantId, eventId, lineId: data.lineId, supplierId: data.supplierId } });
      const best = prior.reduce((m, b) => Math.min(m, Number(b.unitPrice)), Infinity);
      if (best !== Infinity && data.unitPrice >= best) {
        throw new BadRequestException(`Auction bid ${data.unitPrice} must be lower than current best ${best}`);
      }
    }
    const b = this.bidRepo.create({
      tenantId, eventId, lineId: data.lineId, supplierId: data.supplierId, round: event.currentRound,
      unitPrice: data.unitPrice, leadTimeDays: data.leadTimeDays ?? null,
      qualityScore: data.qualityScore ?? null, notes: data.notes ?? null,
    } as any) as unknown as SourcingBid;
    return (this.bidRepo.save(b) as unknown) as Promise<SourcingBid>;
  }

  /** Bid history for a supplier/line across all rounds. */
  listBids(tenantId: string, eventId: string, lineId?: string): Promise<SourcingBid[]> {
    const where: any = { tenantId, eventId };
    if (lineId) where.lineId = lineId;
    return this.bidRepo.find({ where, order: { round: 'ASC', submittedAt: 'ASC' } });
  }

  /** Open a fresh bidding round (re-round): suppliers can resubmit improved bids. */
  async startNextRound(tenantId: string, eventId: string): Promise<SourcingEvent> {
    const event = await this.getEvent(tenantId, eventId);
    if (event.status !== SourcingEventStatus.BIDDING && event.status !== SourcingEventStatus.SCORING) {
      throw new BadRequestException('Only an active event can be re-rounded');
    }
    event.currentRound += 1;
    event.status = SourcingEventStatus.BIDDING;
    return (this.eventRepo.save(event) as unknown) as Promise<SourcingEvent>;
  }

  // ─── Ph-200: scoring & award recommendation ───────────────────────

  /**
   * Score a line's latest-round bids on weighted price/quality/delivery.
   * Price & delivery are "lower is better" (normalized to the best); quality is
   * the evaluator's 0–100 score. Returns bids ranked best-first.
   */
  async scoreLine(tenantId: string, eventId: string, lineId: string): Promise<any> {
    const event = await this.getEvent(tenantId, eventId);
    const line = await this.lineRepo.findOne({ where: { id: lineId, tenantId, eventId } });
    if (!line) throw new NotFoundException('Event line not found');
    const allBids = await this.bidRepo.find({ where: { tenantId, eventId, lineId } });
    // Latest bid per supplier (highest round, then most recent).
    const latest = new Map<string, SourcingBid>();
    for (const b of allBids) {
      const cur = latest.get(b.supplierId);
      if (!cur || b.round > cur.round || (b.round === cur.round && b.submittedAt > cur.submittedAt)) latest.set(b.supplierId, b);
    }
    const bids = [...latest.values()];
    if (bids.length === 0) return { lineId, ranked: [], recommendation: null };

    const minPrice = Math.min(...bids.map((b) => Number(b.unitPrice)).filter((p) => p > 0));
    const leads = bids.map((b) => (b.leadTimeDays != null ? Number(b.leadTimeDays) : null)).filter((l): l is number => l != null && l > 0);
    const minLead = leads.length ? Math.min(...leads) : null;
    const maxLead = leads.length ? Math.max(...leads) : null;

    const wSum = Number(event.weightPrice) + Number(event.weightQuality) + Number(event.weightDelivery) || 1;
    const wP = Number(event.weightPrice) / wSum, wQ = Number(event.weightQuality) / wSum, wD = Number(event.weightDelivery) / wSum;

    const ranked = bids.map((b) => {
      const price = Number(b.unitPrice);
      const priceScore = price > 0 && minPrice ? round2((minPrice / price) * 100) : 0;
      const qualityScore = b.qualityScore != null ? Number(b.qualityScore) : 0;
      let deliveryScore: number;
      if (b.leadTimeDays != null && minLead) deliveryScore = round2((minLead / Number(b.leadTimeDays)) * 100);
      else if (minLead == null) deliveryScore = 100; // nobody quoted lead time
      else deliveryScore = maxLead ? round2((minLead / maxLead) * 100) : 0; // missing lead → treated as worst
      const total = round2(wP * priceScore + wQ * qualityScore + wD * deliveryScore);
      return {
        supplierId: b.supplierId, round: b.round, unitPrice: price, leadTimeDays: b.leadTimeDays,
        priceScore, qualityScore, deliveryScore, totalScore: total,
      };
    }).sort((a, b) => b.totalScore - a.totalScore);

    return { lineId, weights: { price: round2(wP), quality: round2(wQ), delivery: round2(wD) }, ranked, recommendation: ranked[0] ?? null };
  }

  /**
   * Award a line to one or more suppliers (split-award). Splits must sum to 100%.
   */
  async awardLine(tenantId: string, eventId: string, lineId: string, awards: Array<{ supplierId: string; unitPrice: number; splitPct?: number }>): Promise<SourcingAward[]> {
    const event = await this.getEvent(tenantId, eventId);
    const line = await this.lineRepo.findOne({ where: { id: lineId, tenantId, eventId } });
    if (!line) throw new NotFoundException('Event line not found');
    if (!awards?.length) throw new BadRequestException('At least one award is required');
    const totalSplit = round2(awards.reduce((s, a) => s + (a.splitPct ?? (100 / awards.length)), 0));
    if (Math.abs(totalSplit - 100) > 0.01) throw new BadRequestException(`Split percentages must sum to 100 (got ${totalSplit})`);
    // Replace any prior awards for this line.
    const existing = await this.awardRepo.find({ where: { tenantId, eventId, lineId } });
    if (existing.length) await this.awardRepo.remove(existing);
    const saved: SourcingAward[] = [];
    for (const a of awards) {
      const splitPct = a.splitPct ?? round2(100 / awards.length);
      const qty = round2((Number(line.quantity) * splitPct) / 100);
      const rec = this.awardRepo.create({
        tenantId, eventId, lineId, supplierId: a.supplierId, awardedQty: qty,
        unitPrice: a.unitPrice, splitPct, poRef: null,
      } as any) as unknown as SourcingAward;
      saved.push((await this.awardRepo.save(rec)) as unknown as SourcingAward);
    }
    event.status = SourcingEventStatus.SCORING;
    await this.eventRepo.save(event);
    return saved;
  }

  listAwards(tenantId: string, eventId: string): Promise<SourcingAward[]> {
    return this.awardRepo.find({ where: { tenantId, eventId }, order: { createdAt: 'ASC' } });
  }

  // ─── Ph-201: award-to-PO ──────────────────────────────────────────

  /**
   * Convert awarded lines into PO proposals grouped by supplier. Stamps a poRef
   * on each award and marks the event AWARDED. Returns one proposal per supplier.
   */
  async awardToPo(tenantId: string, eventId: string): Promise<any> {
    const event = await this.getEvent(tenantId, eventId);
    const awards = await this.awardRepo.find({ where: { tenantId, eventId } });
    if (awards.length === 0) throw new BadRequestException('No awards to convert');
    const unconverted = awards.filter((a) => !a.poRef);
    if (unconverted.length === 0) throw new BadRequestException('All awards already converted to PO');
    const lines = await this.lineRepo.find({ where: { tenantId, eventId } });
    const lineById = new Map(lines.map((l) => [l.id, l]));

    const bySupplier = new Map<string, SourcingAward[]>();
    for (const a of unconverted) {
      if (!bySupplier.has(a.supplierId)) bySupplier.set(a.supplierId, []);
      bySupplier.get(a.supplierId)!.push(a);
    }
    const proposals: any[] = [];
    let seq = 0;
    for (const [supplierId, supplierAwards] of bySupplier) {
      seq++;
      const poRef = `${event.eventNumber}-PO${String(seq).padStart(2, '0')}`;
      let total = 0;
      const poLines = supplierAwards.map((a) => {
        const line = lineById.get(a.lineId);
        const lineTotal = round2(Number(a.awardedQty) * Number(a.unitPrice));
        total = round2(total + lineTotal);
        return { lineId: a.lineId, description: line?.description ?? '', itemCode: line?.itemCode ?? null, qty: Number(a.awardedQty), unitPrice: Number(a.unitPrice), lineTotal };
      });
      for (const a of supplierAwards) { a.poRef = poRef; await this.awardRepo.save(a); }
      proposals.push({ poRef, supplierId, currency: event.currency, total, lines: poLines });
    }
    event.status = SourcingEventStatus.AWARDED;
    await this.eventRepo.save(event);
    return { eventId, eventNumber: event.eventNumber, proposals };
  }

  async getEvent(tenantId: string, id: string): Promise<SourcingEvent> {
    const e = await this.eventRepo.findOne({ where: { id, tenantId } });
    if (!e) throw new NotFoundException(`Sourcing event ${id} not found`);
    return e;
  }
}
