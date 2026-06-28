import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CmmsService } from './cmms.service';
import { WorkOrderPart, WoPartStatus } from './entities/work-order-part.entity';
import { AssetWarranty, WarrantyStatus } from './entities/asset-warranty.entity';
import { MaintenanceOrder } from '../entities/maintenance-order.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('CmmsService — Phase 164-166', () => {
  let service: CmmsService;
  let partRepo: any, warrantyRepo: any, orderRepo: any;

  beforeEach(async () => {
    partRepo = mockRepo(); warrantyRepo = mockRepo(); orderRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        CmmsService,
        { provide: getRepositoryToken(WorkOrderPart), useValue: partRepo },
        { provide: getRepositoryToken(AssetWarranty), useValue: warrantyRepo },
        { provide: getRepositoryToken(MaintenanceOrder), useValue: orderRepo },
      ],
    }).compile();
    service = module.get(CmmsService);
  });

  // ─── Ph-164: parts ────────────────────────────────────────────────

  it('reservePart — requires the work order to exist', async () => {
    orderRepo.findOne.mockResolvedValue(null);
    await expect(service.reservePart('t1', { maintenanceOrderId: 'nope', itemId: 'i1', qtyReserved: 2 })).rejects.toThrow(NotFoundException);
  });

  it('reservePart — happy path', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'wo1' });
    const p = await service.reservePart('t1', { maintenanceOrderId: 'wo1', itemId: 'i1', qtyReserved: 5, unitCost: 10 });
    expect(partRepo.create).toHaveBeenCalledWith(expect.objectContaining({ qtyReserved: 5, status: WoPartStatus.RESERVED }));
    expect(p.id).toBe('gen-1');
  });

  it('issuePart — issues reserved qty by default', async () => {
    partRepo.findOne.mockResolvedValue({ id: 'p1', status: WoPartStatus.RESERVED, qtyReserved: 5 });
    partRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const p = await service.issuePart('t1', 'p1');
    expect(p.qtyIssued).toBe(5);
    expect(p.status).toBe(WoPartStatus.ISSUED);
  });

  it('cancelPart — rejects issued', async () => {
    partRepo.findOne.mockResolvedValue({ id: 'p1', status: WoPartStatus.ISSUED });
    await expect(service.cancelPart('t1', 'p1')).rejects.toThrow(BadRequestException);
  });

  it('issueAllForOrder — issues all reserved and totals cost', async () => {
    partRepo.find.mockResolvedValue([
      { id: 'p1', status: WoPartStatus.RESERVED, qtyReserved: 2, unitCost: 10 },
      { id: 'p2', status: WoPartStatus.RESERVED, qtyReserved: 3, unitCost: 5 },
    ]);
    partRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.issueAllForOrder('t1', 'wo1');
    expect(r.issued).toBe(2);
    expect(r.partsCost).toBe(35); // 2*10 + 3*5
  });

  // ─── Ph-166: warranty ─────────────────────────────────────────────

  it('createWarranty — rejects end before start', async () => {
    await expect(service.createWarranty('t1', { equipmentId: 'e1', provider: 'X', startDate: '2026-06-01', endDate: '2026-01-01' })).rejects.toThrow(BadRequestException);
  });

  it('isUnderWarranty — true within window', async () => {
    warrantyRepo.find.mockResolvedValue([{ id: 'w1', startDate: '2026-01-01', endDate: '2026-12-31', status: WarrantyStatus.ACTIVE }]);
    const r = await service.isUnderWarranty('t1', 'e1', '2026-06-15');
    expect(r.underWarranty).toBe(true);
    expect(r.warranty?.id).toBe('w1');
  });

  it('isUnderWarranty — false outside window', async () => {
    warrantyRepo.find.mockResolvedValue([{ id: 'w1', startDate: '2026-01-01', endDate: '2026-03-31', status: WarrantyStatus.ACTIVE }]);
    const r = await service.isUnderWarranty('t1', 'e1', '2026-06-15');
    expect(r.underWarranty).toBe(false);
  });

  it('recordClaim — increments count and amount', async () => {
    warrantyRepo.findOne.mockResolvedValue({ id: 'w1', status: WarrantyStatus.ACTIVE, claimCount: 1, claimedAmount: 100 });
    warrantyRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const w = await service.recordClaim('t1', 'w1', 50);
    expect(w.claimCount).toBe(2);
    expect(w.claimedAmount).toBe(150);
  });

  // ─── Ph-165: service history ──────────────────────────────────────

  it('serviceHistory — aggregates work orders, parts and cost', async () => {
    orderRepo.find.mockResolvedValue([
      { id: 'wo1', orderNumber: 'WO-1', type: 'PREVENTIVE', status: 'COMPLETED', laborHours: 4, totalCost: 200 },
      { id: 'wo2', orderNumber: 'WO-2', type: 'CORRECTIVE', status: 'COMPLETED', laborHours: 2, totalCost: 100 },
    ]);
    partRepo.find.mockResolvedValue([
      { maintenanceOrderId: 'wo1', qtyIssued: 2, unitCost: 10 }, // 20
      { maintenanceOrderId: 'wo2', qtyIssued: 1, unitCost: 30 }, // 30
    ]);
    const h = await service.serviceHistory('t1', 'e1');
    expect(h.workOrderCount).toBe(2);
    expect(h.totalLaborHours).toBe(6);
    expect(h.totalPartsCost).toBe(50);
    expect(h.totalCost).toBe(350); // 200+100 order costs + 50 parts
  });
});
