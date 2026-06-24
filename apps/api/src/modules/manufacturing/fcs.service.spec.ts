import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FcsService } from './fcs.service';
import { SlotStatus } from './entities/capacity-slot.entity';
import { mockRepo, mockQueryBuilder } from '../../test/mock-repo';

describe('FcsService', () => {
  let slotRepo: any, orderRepo: any, wcRepo: any, routingOpRepo: any,
    routingRepo: any, itemRepo: any, svc: FcsService;

  beforeEach(() => {
    slotRepo = mockRepo();
    orderRepo = mockRepo();
    wcRepo = mockRepo();
    routingOpRepo = mockRepo();
    routingRepo = mockRepo();
    itemRepo = mockRepo();
    svc = new FcsService(slotRepo, orderRepo, wcRepo, routingOpRepo, routingRepo, itemRepo);
  });

  describe('getCapacityLoad', () => {
    it('aggregates load per day and flags overload', async () => {
      wcRepo.findOne.mockResolvedValue({ id: 'wc1', name: 'CNC', capacityMinutesPerDay: 480 });
      slotRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([
        { scheduledStart: new Date('2026-06-24T08:00:00Z'), loadMinutes: 300, setupMinutes: 30 },
        { scheduledStart: new Date('2026-06-24T14:00:00Z'), loadMinutes: 200, setupMinutes: 0 },
      ]));
      const res = await svc.getCapacityLoad('t1', 'wc1', '2026-06-24', '2026-06-24');
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({
        availableMinutes: 480, loadMinutes: 500, setupMinutes: 30, totalUsed: 530, overloaded: true,
      });
      expect(res[0].utilizationPct).toBe(110); // round(530/480*100)
    });

    it('derives daily capacity from capacityPerHour when minutes-per-day is unset', async () => {
      wcRepo.findOne.mockResolvedValue({ id: 'wc1', name: 'Mill', capacityMinutesPerDay: null, capacityPerHour: 10 });
      slotRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([
        { scheduledStart: new Date('2026-06-24T08:00:00Z'), loadMinutes: 480, setupMinutes: 0 },
      ]));
      const res = await svc.getCapacityLoad('t1', 'wc1', '2026-06-24', '2026-06-24');
      expect(res[0].availableMinutes).toBe(4800); // 10 * 8 * 60
      expect(res[0].overloaded).toBe(false);
    });

    it('throws when the work center is missing', async () => {
      wcRepo.findOne.mockResolvedValue(null);
      await expect(svc.getCapacityLoad('t1', 'wcX', '2026-06-24', '2026-06-24')).rejects.toThrow(NotFoundException);
    });
  });

  describe('scheduleOrder', () => {
    it('throws when the production order is missing', async () => {
      orderRepo.findOne.mockResolvedValue(null);
      await expect(svc.scheduleOrder('t1', 'oX')).rejects.toThrow(NotFoundException);
    });

    it('throws when the order has neither routing nor a work center', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1', tenantId: 't1', finishedItemCode: 'FG-1',
        plannedStartDate: '2026-06-24', plannedQuantity: 10, workCenterId: null,
      });
      slotRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([]));
      itemRepo.findOne.mockResolvedValue(null);
      await expect(svc.scheduleOrder('t1', 'o1')).rejects.toThrow(BadRequestException);
    });

    it('creates a single slot from the order work center when no routing exists', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 'o1', tenantId: 't1', finishedItemCode: 'FG-1',
        plannedStartDate: '2026-06-24', plannedQuantity: 10, workCenterId: 'wc1',
      });
      slotRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([], { usedMins: 0 }));
      itemRepo.findOne.mockResolvedValue(null);
      wcRepo.findOne.mockResolvedValue({ id: 'wc1', name: 'CNC', capacityMinutesPerDay: 480 });
      slotRepo.save.mockImplementation(async (x: any) => ({ id: 's1', ...x }));

      const res = await svc.scheduleOrder('t1', 'o1');
      expect(res).toHaveLength(1);
      expect(res[0].loadMinutes).toBe(480);
      expect(res[0].workCenterId).toBe('wc1');
    });
  });

  describe('updateSlotStatus', () => {
    it('updates the status of an existing slot', async () => {
      slotRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1', status: SlotStatus.SCHEDULED });
      slotRepo.save.mockImplementation(async (x: any) => x);
      const res = await svc.updateSlotStatus('t1', 's1', SlotStatus.IN_PROGRESS);
      expect(res.status).toBe(SlotStatus.IN_PROGRESS);
    });

    it('throws when the slot is missing', async () => {
      slotRepo.findOne.mockResolvedValue(null);
      await expect(svc.updateSlotStatus('t1', 'sX', SlotStatus.COMPLETED)).rejects.toThrow(NotFoundException);
    });
  });

  describe('listAllCapacityLoads', () => {
    it('returns only work centers that carry load in the window', async () => {
      wcRepo.find.mockResolvedValue([
        { id: 'wc1', name: 'CNC' },
        { id: 'wc2', name: 'Idle' },
      ]);
      wcRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.id === 'wc1' ? { id: 'wc1', name: 'CNC', capacityMinutesPerDay: 480 }
          : { id: 'wc2', name: 'Idle', capacityMinutesPerDay: 480 });
      slotRepo.createQueryBuilder.mockImplementation(() => {
        // wc1 has a slot, wc2 has none
        return mockQueryBuilder([]);
      });
      // Make wc1 query return a slot, wc2 none via call order
      let call = 0;
      slotRepo.createQueryBuilder.mockImplementation(() => {
        call += 1;
        return call === 1
          ? mockQueryBuilder([{ scheduledStart: new Date('2026-06-24T08:00:00Z'), loadMinutes: 100, setupMinutes: 0 }])
          : mockQueryBuilder([]);
      });
      const res = await svc.listAllCapacityLoads('t1', '2026-06-24', '2026-06-30');
      expect(res).toHaveLength(1);
      expect(res[0].workCenter.id).toBe('wc1');
    });
  });
});
