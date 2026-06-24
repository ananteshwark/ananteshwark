import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatchCharacteristic, CharacteristicResult } from './entities/batch-characteristic.entity';
import { BinStock } from './entities/bin-stock.entity';
import { WarehouseTask, TaskType, TaskStatus } from './entities/warehouse-task.entity';
import { LotSerial, LotStatus } from './entities/lot-serial.entity';
import { BinLocation } from './entities/bin-location.entity';

@Injectable()
export class WmsService {
  constructor(
    @InjectRepository(BatchCharacteristic) private readonly batchCharRepo: Repository<BatchCharacteristic>,
    @InjectRepository(BinStock) private readonly binStockRepo: Repository<BinStock>,
    @InjectRepository(WarehouseTask) private readonly taskRepo: Repository<WarehouseTask>,
    @InjectRepository(LotSerial) private readonly lotRepo: Repository<LotSerial>,
    @InjectRepository(BinLocation) private readonly binRepo: Repository<BinLocation>,
  ) {}

  private async nextTaskNumber(tenantId: string): Promise<string> {
    const count = await this.taskRepo.count({ where: { tenantId } });
    return `WMS-${String(count + 1).padStart(6, '0')}`;
  }

  // ─── Batch Management ─────────────────────────────────────────────

  async getBatchCharacteristics(tenantId: string, lotSerialId: string): Promise<BatchCharacteristic[]> {
    return this.batchCharRepo.find({ where: { tenantId, lotSerialId }, order: { name: 'ASC' } });
  }

  async recordBatchCharacteristics(tenantId: string, lotSerialId: string, characteristics: any[]): Promise<BatchCharacteristic[]> {
    const lot = await this.lotRepo.findOne({ where: { id: lotSerialId, tenantId } });
    if (!lot) throw new NotFoundException(`Lot ${lotSerialId} not found`);

    const saved: BatchCharacteristic[] = [];
    for (const char of characteristics) {
      // Compute pass/fail if min/max provided
      let result = CharacteristicResult.PENDING;
      if (char.value !== undefined && char.value !== null) {
        const numVal = parseFloat(char.value);
        if (!isNaN(numVal) && (char.minValue !== undefined || char.maxValue !== undefined)) {
          const min = char.minValue != null ? Number(char.minValue) : -Infinity;
          const max = char.maxValue != null ? Number(char.maxValue) : Infinity;
          result = numVal >= min && numVal <= max ? CharacteristicResult.PASS : CharacteristicResult.FAIL;
        }
      }

      // Upsert by lot + name
      let existing = await this.batchCharRepo.findOne({ where: { tenantId, lotSerialId, name: char.name } });
      if (existing) {
        Object.assign(existing, { ...char, result, testedAt: new Date() });
        saved.push(await this.batchCharRepo.save(existing));
      } else {
        const entity = this.batchCharRepo.create({
          tenantId, lotSerialId,
          ...char,
          result,
          testedAt: new Date(),
        } as any);
        saved.push((await this.batchCharRepo.save(entity) as unknown) as BatchCharacteristic);
      }
    }
    return saved;
  }

  async releaseBatch(tenantId: string, lotSerialId: string): Promise<LotSerial> {
    const lot = await this.lotRepo.findOne({ where: { id: lotSerialId, tenantId } });
    if (!lot) throw new NotFoundException(`Lot ${lotSerialId} not found`);
    if (lot.status !== LotStatus.QUARANTINE) {
      throw new BadRequestException('Only QUARANTINE batches can be released');
    }
    // Check no FAIL characteristics pending
    const fails = await this.batchCharRepo.count({ where: { tenantId, lotSerialId, result: CharacteristicResult.FAIL } });
    if (fails > 0) {
      throw new BadRequestException(`Batch has ${fails} failing quality characteristic(s)`);
    }
    lot.status = LotStatus.ACTIVE;
    return this.lotRepo.save(lot);
  }

  async quarantineBatch(tenantId: string, lotSerialId: string): Promise<LotSerial> {
    const lot = await this.lotRepo.findOne({ where: { id: lotSerialId, tenantId } });
    if (!lot) throw new NotFoundException(`Lot ${lotSerialId} not found`);
    if (lot.status !== LotStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE batches can be quarantined');
    }
    lot.status = LotStatus.QUARANTINE;
    return this.lotRepo.save(lot);
  }

  async fefoPickSuggestion(tenantId: string, itemId: string, warehouseId: string, qtyNeeded: number): Promise<any[]> {
    // FEFO: First Expiry First Out — return active lots ordered by expiry date asc
    const lots = await this.lotRepo
      .createQueryBuilder('l')
      .where('l.tenantId = :tenantId', { tenantId })
      .andWhere('l.itemId = :itemId', { itemId })
      .andWhere('l.warehouseId = :warehouseId OR l.warehouseId IS NULL', { warehouseId })
      .andWhere('l.status = :status', { status: LotStatus.ACTIVE })
      .andWhere('l.availableQty > 0')
      .orderBy('l.expiryDate', 'ASC', 'NULLS LAST')
      .addOrderBy('l.createdAt', 'ASC')
      .getMany();

    const picks: any[] = [];
    let remaining = qtyNeeded;

    for (const lot of lots) {
      if (remaining <= 0) break;
      const pickQty = Math.min(remaining, Number(lot.availableQty));
      picks.push({ lotSerialId: lot.id, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate, pickQty });
      remaining -= pickQty;
    }

    return picks;
  }

  // ─── Bin Stock ────────────────────────────────────────────────────

  async getBinStock(tenantId: string, params: { warehouseId?: string; binLocationId?: string; itemId?: string } = {}): Promise<BinStock[]> {
    const where: any = { tenantId };
    if (params.warehouseId) where.warehouseId = params.warehouseId;
    if (params.binLocationId) where.binLocationId = params.binLocationId;
    if (params.itemId) where.itemId = params.itemId;
    return this.binStockRepo.find({ where, order: { updatedAt: 'DESC' } });
  }

  async adjustBinStock(tenantId: string, binLocationId: string, warehouseId: string, itemId: string, lotSerialId: string | null, delta: number): Promise<BinStock> {
    let bs = await this.binStockRepo.findOne({ where: { tenantId, binLocationId, itemId, lotSerialId: lotSerialId ?? undefined } as any });
    if (!bs) {
      bs = (this.binStockRepo.create({ tenantId, binLocationId, warehouseId, itemId, lotSerialId, qty: 0, reservedQty: 0 } as any) as unknown) as BinStock;
    }
    bs.qty = Math.max(0, Number(bs.qty) + delta);
    return (this.binStockRepo.save(bs) as unknown) as Promise<BinStock>;
  }

  // ─── Warehouse Tasks ──────────────────────────────────────────────

  async createTask(tenantId: string, dto: any): Promise<WarehouseTask> {
    const taskNumber = await this.nextTaskNumber(tenantId);
    const entity = this.taskRepo.create({ ...dto, tenantId, taskNumber } as any);
    return (this.taskRepo.save(entity) as unknown) as Promise<WarehouseTask>;
  }

  async listTasks(tenantId: string, params: { status?: TaskStatus; taskType?: TaskType; warehouseId?: string } = {}): Promise<WarehouseTask[]> {
    const where: any = { tenantId };
    if (params.status) where.status = params.status;
    if (params.taskType) where.taskType = params.taskType;
    if (params.warehouseId) where.warehouseId = params.warehouseId;
    return this.taskRepo.find({ where, order: { priority: 'DESC', createdAt: 'ASC' } });
  }

  async getTask(tenantId: string, id: string): Promise<WarehouseTask> {
    const t = await this.taskRepo.findOne({ where: { id, tenantId } });
    if (!t) throw new NotFoundException(`Warehouse task ${id} not found`);
    return t;
  }

  async assignTask(tenantId: string, id: string, userId: string): Promise<WarehouseTask> {
    const t = await this.getTask(tenantId, id);
    t.assignedUserId = userId;
    if (t.status === TaskStatus.OPEN) t.status = TaskStatus.IN_PROGRESS;
    return this.taskRepo.save(t);
  }

  async completeTask(tenantId: string, id: string): Promise<WarehouseTask> {
    const t = await this.getTask(tenantId, id);
    if (t.status === TaskStatus.COMPLETED) throw new BadRequestException('Task already completed');
    if (t.status === TaskStatus.CANCELLED) throw new BadRequestException('Cannot complete a cancelled task');

    // Move bin stock: MOVE/PICK from source, PUTAWAY to dest
    if (t.taskType === TaskType.MOVE || t.taskType === TaskType.PICK) {
      if (t.sourceBinId) {
        await this.adjustBinStock(tenantId, t.sourceBinId, t.warehouseId, t.itemId, t.lotSerialId, -Number(t.qty));
      }
    }
    if (t.taskType === TaskType.MOVE || t.taskType === TaskType.PUTAWAY || t.taskType === TaskType.REPLENISH) {
      if (t.destBinId) {
        await this.adjustBinStock(tenantId, t.destBinId, t.warehouseId, t.itemId, t.lotSerialId, Number(t.qty));
      }
    }

    t.status = TaskStatus.COMPLETED;
    t.completedAt = new Date();
    return this.taskRepo.save(t);
  }

  async cancelTask(tenantId: string, id: string): Promise<WarehouseTask> {
    const t = await this.getTask(tenantId, id);
    if (t.status === TaskStatus.COMPLETED) throw new BadRequestException('Cannot cancel a completed task');
    t.status = TaskStatus.CANCELLED;
    return this.taskRepo.save(t);
  }

  async suggestPutawayBin(tenantId: string, warehouseId: string, itemId: string, qty: number): Promise<BinLocation[]> {
    // Suggest bins with existing stock of same item (consolidation) or empty bins
    const activeBins = await this.binStockRepo
      .createQueryBuilder('bs')
      .where('bs.tenantId = :tenantId AND bs.warehouseId = :warehouseId AND bs.itemId = :itemId AND bs.qty > 0',
        { tenantId, warehouseId, itemId })
      .select('bs.binLocationId')
      .getMany();

    const binIds = activeBins.map(b => b.binLocationId);
    if (binIds.length > 0) {
      const bins = await this.binRepo.find({ where: binIds.map(id => ({ id, warehouseId, isActive: true })) });
      if (bins.length > 0) return bins.slice(0, 3);
    }

    // Otherwise suggest first few active empty bins
    return this.binRepo.find({ where: { tenantId, warehouseId, isActive: true }, take: 3, order: { code: 'ASC' } });
  }
}
