import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { MobileService } from './mobile.service';
import { MobileCheckin } from './entities/mobile-checkin.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('MobileService — Phase 262-264', () => {
  let service: MobileService;
  let checkinRepo: any;

  beforeEach(async () => {
    checkinRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        MobileService,
        { provide: getRepositoryToken(MobileCheckin), useValue: checkinRepo },
      ],
    }).compile();
    service = module.get(MobileService);
  });

  // ─── Ph-262: receipt parse ────────────────────────────────────────

  it('parseReceipt — extracts merchant, total, and date', () => {
    const r = service.parseReceipt('Cafe Coffee Day\n2026-06-15\nLatte 250.00\nTax 45.00\nTotal ₹ 295.00');
    expect(r.merchant).toBe('Cafe Coffee Day');
    expect(r.amount).toBe(295);
    expect(r.currency).toBe('INR');
    expect(r.date).toBe('2026-06-15');
    expect(r.confidence).toBe(1);
  });

  it('parseReceipt — falls back to the largest figure without a total keyword', () => {
    const r = service.parseReceipt('Shop XYZ\nItem A 10.00\nItem B 40.00');
    expect(r.amount).toBe(40);
  });

  it('parseReceipt — normalizes dd/mm/yyyy dates', () => {
    const r = service.parseReceipt('Store\n15/06/2026\nTotal $12.00');
    expect(r.date).toBe('2026-06-15');
    expect(r.currency).toBe('USD');
  });

  it('parseReceipt — rejects empty text', () => {
    expect(() => service.parseReceipt('')).toThrow(BadRequestException);
  });

  // ─── Ph-263: timesheet ────────────────────────────────────────────

  it('checkIn — rejects a second open check-in', async () => {
    checkinRepo.findOne.mockResolvedValue({ id: 'c1', checkOutAt: null });
    await expect(service.checkIn('t1', { employeeId: 'e1', date: '2026-06-15', at: '2026-06-15T09:00:00Z' })).rejects.toThrow(BadRequestException);
  });

  it('checkOut — computes hours from the interval', async () => {
    checkinRepo.findOne.mockResolvedValue({ id: 'c1', checkInAt: '2026-06-15T09:00:00Z', checkOutAt: null });
    checkinRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.checkOut('t1', 'c1', '2026-06-15T17:30:00Z');
    expect(r.hours).toBe(8.5);
  });

  it('checkOut — rejects checkout before checkin', async () => {
    checkinRepo.findOne.mockResolvedValue({ id: 'c1', checkInAt: '2026-06-15T09:00:00Z', checkOutAt: null });
    await expect(service.checkOut('t1', 'c1', '2026-06-15T08:00:00Z')).rejects.toThrow(BadRequestException);
  });

  it('weeklyTimesheet — aggregates hours by day and project', async () => {
    checkinRepo.find.mockResolvedValue([
      { date: '2026-06-15', projectId: 'p1', hours: 8 },
      { date: '2026-06-15', projectId: 'p2', hours: 1 },
      { date: '2026-06-16', projectId: 'p1', hours: 7 },
    ]);
    const r = await service.weeklyTimesheet('t1', 'e1', '2026-06-15', '2026-06-21');
    expect(r.totalHours).toBe(16);
    expect(r.byDay.find((d: any) => d.date === '2026-06-15').hours).toBe(9);
    expect(r.byProject.find((p: any) => p.projectId === 'p1').hours).toBe(15);
  });

  // ─── Ph-264: warehouse scan ───────────────────────────────────────

  it('confirmScan — confirms an exact match', () => {
    const r = service.confirmScan({ bin: 'A1', item: 'SKU9', qty: 5 }, { bin: 'a1', item: 'sku9', qty: 5 });
    expect(r.confirmed).toBe(true);
    expect(r.mismatches).toEqual([]);
  });

  it('confirmScan — flags bin and qty mismatches', () => {
    const r = service.confirmScan({ bin: 'A1', item: 'SKU9', qty: 5 }, { bin: 'B2', item: 'SKU9', qty: 3 });
    expect(r.confirmed).toBe(false);
    expect(r.mismatches).toEqual(['BIN', 'QTY']);
    expect(r.shortQty).toBe(2);
  });
});
