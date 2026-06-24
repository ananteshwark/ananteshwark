import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WmsService } from './wms.service';
import { CharacteristicResult } from './entities/batch-characteristic.entity';
import { TaskType, TaskStatus } from './entities/warehouse-task.entity';
import { LotStatus } from './entities/lot-serial.entity';
import { mockRepo, mockQueryBuilder } from '../../test/mock-repo';

describe('WmsService', () => {
  let batchCharRepo: any, binStockRepo: any, taskRepo: any, lotRepo: any, binRepo: any, svc: WmsService;

  beforeEach(() => {
    batchCharRepo = mockRepo();
    binStockRepo = mockRepo();
    taskRepo = mockRepo();
    lotRepo = mockRepo();
    binRepo = mockRepo();
    svc = new WmsService(batchCharRepo, binStockRepo, taskRepo, lotRepo, binRepo);
  });

  describe('recordBatchCharacteristics', () => {
    beforeEach(() => {
      lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1' });
      batchCharRepo.findOne.mockResolvedValue(null);
      batchCharRepo.save.mockImplementation(async (x: any) => x);
    });

    it('marks PASS when value is within min/max', async () => {
      const res = await svc.recordBatchCharacteristics('t1', 'l1', [
        { name: 'pH', value: '7', minValue: 6, maxValue: 8 },
      ]);
      expect(res[0].result).toBe(CharacteristicResult.PASS);
    });

    it('marks FAIL when value is outside min/max', async () => {
      const res = await svc.recordBatchCharacteristics('t1', 'l1', [
        { name: 'Moisture', value: '15', minValue: 0, maxValue: 10 },
      ]);
      expect(res[0].result).toBe(CharacteristicResult.FAIL);
    });

    it('marks PENDING when no numeric thresholds apply', async () => {
      const res = await svc.recordBatchCharacteristics('t1', 'l1', [
        { name: 'Color', value: 'blue' },
      ]);
      expect(res[0].result).toBe(CharacteristicResult.PENDING);
    });

    it('throws when the lot is missing', async () => {
      lotRepo.findOne.mockResolvedValue(null);
      await expect(svc.recordBatchCharacteristics('t1', 'lX', [])).rejects.toThrow(NotFoundException);
    });
  });

  describe('releaseBatch', () => {
    it('releases a quarantined lot with no failing characteristics', async () => {
      lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', status: LotStatus.QUARANTINE });
      batchCharRepo.count.mockResolvedValue(0);
      lotRepo.save.mockImplementation(async (x: any) => x);
      const res = await svc.releaseBatch('t1', 'l1');
      expect(res.status).toBe(LotStatus.ACTIVE);
    });

    it('blocks release when failing characteristics exist', async () => {
      lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', status: LotStatus.QUARANTINE });
      batchCharRepo.count.mockResolvedValue(2);
      await expect(svc.releaseBatch('t1', 'l1')).rejects.toThrow(BadRequestException);
    });

    it('blocks release when the lot is not quarantined', async () => {
      lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', status: LotStatus.ACTIVE });
      await expect(svc.releaseBatch('t1', 'l1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('quarantineBatch', () => {
    it('quarantines an active lot', async () => {
      lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', status: LotStatus.ACTIVE });
      lotRepo.save.mockImplementation(async (x: any) => x);
      const res = await svc.quarantineBatch('t1', 'l1');
      expect(res.status).toBe(LotStatus.QUARANTINE);
    });

    it('rejects quarantine of a non-active lot', async () => {
      lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', status: LotStatus.QUARANTINE });
      await expect(svc.quarantineBatch('t1', 'l1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('fefoPickSuggestion', () => {
    it('allocates across lots earliest-expiry-first until the quantity is met', async () => {
      binStockRepo; // unused here
      lotRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([
        { id: 'lotA', lotNumber: 'A', expiryDate: '2026-07-01', availableQty: 30 },
        { id: 'lotB', lotNumber: 'B', expiryDate: '2026-08-01', availableQty: 50 },
      ]));
      const res = await svc.fefoPickSuggestion('t1', 'item1', 'wh1', 40);
      expect(res).toHaveLength(2);
      expect(res[0]).toMatchObject({ lotSerialId: 'lotA', pickQty: 30 });
      expect(res[1]).toMatchObject({ lotSerialId: 'lotB', pickQty: 10 });
    });

    it('stops once the requested quantity is satisfied', async () => {
      lotRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder([
        { id: 'lotA', lotNumber: 'A', expiryDate: '2026-07-01', availableQty: 100 },
        { id: 'lotB', lotNumber: 'B', expiryDate: '2026-08-01', availableQty: 50 },
      ]));
      const res = await svc.fefoPickSuggestion('t1', 'item1', 'wh1', 40);
      expect(res).toHaveLength(1);
      expect(res[0].pickQty).toBe(40);
    });
  });

  describe('adjustBinStock', () => {
    it('adds delta onto an existing bin stock row', async () => {
      binStockRepo.findOne.mockResolvedValue({ id: 'bs1', qty: 10, reservedQty: 0 });
      binStockRepo.save.mockImplementation(async (x: any) => x);
      const res = await svc.adjustBinStock('t1', 'bin1', 'wh1', 'item1', null, 5);
      expect(res.qty).toBe(15);
    });

    it('never lets quantity go below zero', async () => {
      binStockRepo.findOne.mockResolvedValue({ id: 'bs1', qty: 3, reservedQty: 0 });
      binStockRepo.save.mockImplementation(async (x: any) => x);
      const res = await svc.adjustBinStock('t1', 'bin1', 'wh1', 'item1', null, -10);
      expect(res.qty).toBe(0);
    });

    it('creates a new bin stock row when none exists', async () => {
      binStockRepo.findOne.mockResolvedValue(null);
      binStockRepo.create.mockImplementation((x: any) => x);
      binStockRepo.save.mockImplementation(async (x: any) => x);
      const res = await svc.adjustBinStock('t1', 'bin1', 'wh1', 'item1', null, 7);
      expect(res.qty).toBe(7);
      expect(binStockRepo.create).toHaveBeenCalled();
    });
  });

  describe('createTask', () => {
    it('assigns a zero-padded sequential task number', async () => {
      taskRepo.count.mockResolvedValue(5);
      taskRepo.create.mockImplementation((x: any) => x);
      taskRepo.save.mockImplementation(async (x: any) => x);
      const res: any = await svc.createTask('t1', { taskType: TaskType.PICK, warehouseId: 'wh1', itemId: 'item1', qty: 5 });
      expect(res.taskNumber).toBe('WMS-000006');
    });
  });

  describe('completeTask', () => {
    it('moves stock out of source and into dest for a MOVE task', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task1', tenantId: 't1', taskType: TaskType.MOVE, status: TaskStatus.OPEN,
        warehouseId: 'wh1', itemId: 'item1', lotSerialId: null, qty: 5,
        sourceBinId: 'binA', destBinId: 'binB',
      });
      taskRepo.save.mockImplementation(async (x: any) => x);
      const adjustSpy = jest.spyOn(svc, 'adjustBinStock').mockResolvedValue({} as any);
      const res = await svc.completeTask('t1', 'task1');
      expect(res.status).toBe(TaskStatus.COMPLETED);
      expect(res.completedAt).toBeInstanceOf(Date);
      expect(adjustSpy).toHaveBeenCalledWith('t1', 'binA', 'wh1', 'item1', null, -5);
      expect(adjustSpy).toHaveBeenCalledWith('t1', 'binB', 'wh1', 'item1', null, 5);
    });

    it('rejects completing an already-completed task', async () => {
      taskRepo.findOne.mockResolvedValue({ id: 'task1', tenantId: 't1', status: TaskStatus.COMPLETED });
      await expect(svc.completeTask('t1', 'task1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelTask', () => {
    it('rejects cancelling a completed task', async () => {
      taskRepo.findOne.mockResolvedValue({ id: 'task1', tenantId: 't1', status: TaskStatus.COMPLETED });
      await expect(svc.cancelTask('t1', 'task1')).rejects.toThrow(BadRequestException);
    });

    it('cancels an open task', async () => {
      taskRepo.findOne.mockResolvedValue({ id: 'task1', tenantId: 't1', status: TaskStatus.OPEN });
      taskRepo.save.mockImplementation(async (x: any) => x);
      const res = await svc.cancelTask('t1', 'task1');
      expect(res.status).toBe(TaskStatus.CANCELLED);
    });
  });
});
