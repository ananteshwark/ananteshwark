import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { MobileCheckin } from './entities/mobile-checkin.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class MobileService {
  constructor(
    @InjectRepository(MobileCheckin) private readonly checkinRepo: Repository<MobileCheckin>,
  ) {}

  // ─── Ph-262: photo-to-expense (receipt OCR parse) ─────────────────

  /**
   * Heuristically parse OCR text from a receipt into expense fields: total
   * amount (largest currency figure near a total keyword), date, and merchant
   * (first non-empty line).
   */
  parseReceipt(ocrText: string): any {
    if (!ocrText?.trim()) throw new BadRequestException('ocrText is required');
    const lines = ocrText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const merchant = lines[0] ?? null;

    // Amount: prefer a line mentioning total; else the largest money figure.
    const moneyRe = /(?:₹|rs\.?|inr|\$|usd|eur|€)?\s*([0-9]{1,3}(?:[, ][0-9]{3})*(?:\.[0-9]{2})?|[0-9]+\.[0-9]{2})/gi;
    const amounts: number[] = [];
    let totalAmount: number | null = null;
    for (const line of lines) {
      const isTotal = /total|amount due|grand total|balance/i.test(line);
      let m: RegExpExecArray | null;
      moneyRe.lastIndex = 0;
      while ((m = moneyRe.exec(line)) !== null) {
        const val = Number(m[1].replace(/[, ]/g, ''));
        if (!Number.isNaN(val)) { amounts.push(val); if (isTotal) totalAmount = Math.max(totalAmount ?? 0, val); }
      }
    }
    if (totalAmount == null && amounts.length) totalAmount = Math.max(...amounts);

    // Currency guess.
    const currency = /₹|rs\.?|inr/i.test(ocrText) ? 'INR' : /\$|usd/i.test(ocrText) ? 'USD' : /€|eur/i.test(ocrText) ? 'EUR' : 'INR';

    // Date: match common formats.
    const dateMatch = ocrText.match(/(\d{4}-\d{2}-\d{2})|(\d{2}[/-]\d{2}[/-]\d{2,4})/);
    let date: string | null = null;
    if (dateMatch) {
      const raw = dateMatch[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) date = raw;
      else {
        const parts = raw.split(/[/-]/);
        const yr = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        date = `${yr}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    const confidence = round2((totalAmount != null ? 0.5 : 0) + (date ? 0.3 : 0) + (merchant ? 0.2 : 0));
    return { merchant, amount: totalAmount != null ? round2(totalAmount) : null, currency, date, confidence };
  }

  // ─── Ph-263: mobile timesheet check-in ────────────────────────────

  async checkIn(tenantId: string, data: { employeeId: string; projectId?: string; taskId?: string; date: string; gpsLat?: number; gpsLng?: number; at: string }): Promise<MobileCheckin> {
    if (!data.employeeId || !data.date) throw new BadRequestException('employeeId and date are required');
    const open = await this.checkinRepo.findOne({ where: { tenantId, employeeId: data.employeeId, date: data.date, checkOutAt: null as any } });
    if (open) throw new BadRequestException('An open check-in already exists; check out first');
    const c = this.checkinRepo.create({
      tenantId, employeeId: data.employeeId, projectId: data.projectId ?? null, taskId: data.taskId ?? null,
      date: data.date, gpsLat: data.gpsLat ?? null, gpsLng: data.gpsLng ?? null,
      checkInAt: new Date(data.at), checkOutAt: null, hours: 0,
    } as any) as unknown as MobileCheckin;
    return (this.checkinRepo.save(c) as unknown) as Promise<MobileCheckin>;
  }

  async checkOut(tenantId: string, id: string, at: string): Promise<MobileCheckin> {
    const c = await this.checkinRepo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Check-in not found');
    if (c.checkOutAt) throw new BadRequestException('Already checked out');
    const outMs = new Date(at).getTime();
    const inMs = new Date(c.checkInAt).getTime();
    if (outMs < inMs) throw new BadRequestException('Check-out cannot precede check-in');
    c.checkOutAt = new Date(at);
    c.hours = round2((outMs - inMs) / 3600000);
    return (this.checkinRepo.save(c) as unknown) as Promise<MobileCheckin>;
  }

  /** Weekly timesheet: total hours by day and project for an employee. */
  async weeklyTimesheet(tenantId: string, employeeId: string, weekStart: string, weekEnd: string): Promise<any> {
    const entries = await this.checkinRepo.find({ where: { tenantId, employeeId, date: Between(weekStart, weekEnd) }, order: { date: 'ASC' } });
    const byDay = new Map<string, number>();
    const byProject = new Map<string, number>();
    let total = 0;
    for (const e of entries) {
      const h = Number(e.hours);
      byDay.set(e.date, round2((byDay.get(e.date) ?? 0) + h));
      const pk = e.projectId ?? 'UNASSIGNED';
      byProject.set(pk, round2((byProject.get(pk) ?? 0) + h));
      total = round2(total + h);
    }
    return {
      employeeId, weekStart, weekEnd, totalHours: total,
      byDay: [...byDay.entries()].map(([date, hours]) => ({ date, hours })),
      byProject: [...byProject.entries()].map(([projectId, hours]) => ({ projectId, hours })),
    };
  }

  // ─── Ph-264: warehouse scan confirmation ──────────────────────────

  /**
   * Confirm a warehouse scan against the expected pick/putaway line. Returns a
   * per-field match plus an overall confirmation.
   */
  confirmScan(expected: { bin: string; item: string; qty: number }, scanned: { bin: string; item: string; qty: number }): any {
    if (!scanned?.bin || !scanned?.item) throw new BadRequestException('scanned bin and item are required');
    const binMatch = String(expected.bin).toUpperCase() === String(scanned.bin).toUpperCase();
    const itemMatch = String(expected.item).toUpperCase() === String(scanned.item).toUpperCase();
    const qtyMatch = Number(expected.qty) === Number(scanned.qty);
    const mismatches: string[] = [];
    if (!binMatch) mismatches.push('BIN');
    if (!itemMatch) mismatches.push('ITEM');
    if (!qtyMatch) mismatches.push('QTY');
    return { confirmed: mismatches.length === 0, binMatch, itemMatch, qtyMatch, mismatches, shortQty: round2(Number(expected.qty) - Number(scanned.qty)) };
  }

  listCheckins(tenantId: string, employeeId: string): Promise<MobileCheckin[]> {
    return this.checkinRepo.find({ where: { tenantId, employeeId }, order: { checkInAt: 'DESC' } });
  }
}
