import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SequenceService } from '../../common/sequence/sequence.service';
import { PickWave, WaveStatus, PickStrategy } from './entities/pick-wave.entity';
import { WarehouseTask, TaskStatus, TaskType } from './entities/warehouse-task.entity';
import { BinStock } from './entities/bin-stock.entity';
import { BinLocation } from './entities/bin-location.entity';
import { LotSerial } from './entities/lot-serial.entity';

export interface PickSuggestion {
  sequence: number;
  binLocationId: string;
  binCode: string;
  zone: string | null;
  aisle: string | null;
  rack: string | null;
  lotSerialId: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
  availableQty: number;
  suggestedQty: number;
}

@Injectable()
export class PickingService {
  constructor(
    @InjectRepository(PickWave) private readonly waveRepo: Repository<PickWave>,
    @InjectRepository(WarehouseTask) private readonly taskRepo: Repository<WarehouseTask>,
    @InjectRepository(BinStock) private readonly binStockRepo: Repository<BinStock>,
    @InjectRepository(BinLocation) private readonly binRepo: Repository<BinLocation>,
    @InjectRepository(LotSerial) private readonly lotRepo: Repository<LotSerial>,
    private readonly sequence: SequenceService,
  ) {}

  private async nextWaveNumber(tenantId: string): Promise<string> {
    return this.sequence.formatted(tenantId, 'pick-wave', 'WAVE-', 6);
  }

  // ─── Wave Management ───────────────────────────────────────────────

  async createWave(tenantId: string, dto: any): Promise<PickWave> {
    const waveNumber = await this.nextWaveNumber(tenantId);
    const entity = (this.waveRepo.create({ ...dto, tenantId, waveNumber } as any) as unknown) as PickWave;
    return (this.waveRepo.save(entity) as unknown) as Promise<PickWave>;
  }

  async listWaves(tenantId: string, params: { warehouseId?: string; status?: WaveStatus } = {}): Promise<any[]> {
    const where: any = { tenantId };
    if (params.warehouseId) where.warehouseId = params.warehouseId;
    if (params.status) where.status = params.status;
    const waves = await this.waveRepo.find({ where, order: { priority: 'DESC', createdAt: 'DESC' } });
    return Promise.all(waves.map(async (w) => {
      const taskCount = await this.taskRepo.count({ where: { tenantId, waveId: w.id } as any });
      const completedCount = await this.taskRepo.count({
        where: { tenantId, waveId: w.id, status: TaskStatus.COMPLETED } as any,
      });
      return { ...w, taskCount, completedCount };
    }));
  }

  async getWave(tenantId: string, id: string): Promise<any> {
    const wave = await this.waveRepo.findOne({ where: { id, tenantId } });
    if (!wave) throw new NotFoundException(`Pick wave ${id} not found`);
    const tasks = await this.taskRepo.find({
      where: { tenantId, waveId: id } as any,
      order: { priority: 'DESC', createdAt: 'ASC' },
    });
    return { ...wave, tasks };
  }

  async addTasksToWave(tenantId: string, waveId: string, taskIds: string[]): Promise<{ added: number }> {
    const wave = await this.waveRepo.findOne({ where: { id: waveId, tenantId } });
    if (!wave) throw new NotFoundException(`Pick wave ${waveId} not found`);
    if (wave.status !== WaveStatus.OPEN) throw new BadRequestException('Can only add tasks to OPEN waves');

    let added = 0;
    for (const taskId of taskIds) {
      const task = await this.taskRepo.findOne({ where: { id: taskId, tenantId } });
      if (!task) continue;
      if (task.taskType !== TaskType.PICK) throw new BadRequestException(`Task ${taskId} is not a PICK task`);
      task.waveId = waveId;
      await this.taskRepo.save(task);
      added++;
    }
    return { added };
  }

  async releaseWave(tenantId: string, id: string): Promise<PickWave> {
    const wave = await this.waveRepo.findOne({ where: { id, tenantId } });
    if (!wave) throw new NotFoundException(`Pick wave ${id} not found`);
    if (wave.status !== WaveStatus.OPEN) throw new BadRequestException('Wave must be OPEN to release');

    const openTasks = await this.taskRepo.find({
      where: { tenantId, waveId: id, status: TaskStatus.OPEN } as any,
    });
    for (const task of openTasks) {
      task.status = TaskStatus.IN_PROGRESS;
      await this.taskRepo.save(task);
    }

    wave.status = WaveStatus.RELEASED;
    wave.releasedAt = new Date();
    return (this.waveRepo.save(wave) as unknown) as Promise<PickWave>;
  }

  async completeWave(tenantId: string, id: string): Promise<PickWave> {
    const wave = await this.waveRepo.findOne({ where: { id, tenantId } });
    if (!wave) throw new NotFoundException(`Pick wave ${id} not found`);
    if (wave.status === WaveStatus.COMPLETED) throw new BadRequestException('Wave already completed');
    if (wave.status === WaveStatus.CANCELLED) throw new BadRequestException('Cannot complete a cancelled wave');

    const openCount = await this.taskRepo
      .createQueryBuilder('t')
      .where('t.tenantId = :tenantId AND t.waveId = :waveId AND t.status IN (:...statuses)',
        { tenantId, waveId: id, statuses: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] })
      .getCount();

    if (openCount > 0) throw new BadRequestException(`${openCount} task(s) still open or in-progress`);

    wave.status = WaveStatus.COMPLETED;
    wave.completedAt = new Date();
    return (this.waveRepo.save(wave) as unknown) as Promise<PickWave>;
  }

  async cancelWave(tenantId: string, id: string): Promise<PickWave> {
    const wave = await this.waveRepo.findOne({ where: { id, tenantId } });
    if (!wave) throw new NotFoundException(`Pick wave ${id} not found`);
    if (wave.status === WaveStatus.COMPLETED) throw new BadRequestException('Cannot cancel a completed wave');
    wave.status = WaveStatus.CANCELLED;
    return (this.waveRepo.save(wave) as unknown) as Promise<PickWave>;
  }

  // ─── Pick Suggestions ──────────────────────────────────────────────

  async suggestPicks(
    tenantId: string,
    warehouseId: string,
    itemId: string,
    qtyNeeded: number,
    strategy: PickStrategy,
  ): Promise<PickSuggestion[]> {
    const stocks = await this.binStockRepo.find({ where: { tenantId, warehouseId, itemId } });
    const available = stocks.filter(s => Number(s.qty) - Number(s.reservedQty) > 0);
    if (available.length === 0) return [];

    interface RichStock {
      bs: BinStock;
      bin: BinLocation | null;
      lot: LotSerial | null;
      availableQty: number;
    }

    const rich: RichStock[] = await Promise.all(
      available.map(async (bs) => {
        const bin = bs.binLocationId
          ? await this.binRepo.findOne({ where: { id: bs.binLocationId } })
          : null;
        const lot = bs.lotSerialId
          ? await this.lotRepo.findOne({ where: { id: bs.lotSerialId, tenantId } })
          : null;
        return { bs, bin, lot, availableQty: Number(bs.qty) - Number(bs.reservedQty) };
      }),
    );

    switch (strategy) {
      case PickStrategy.FIFO:
        rich.sort((a, b) => {
          const aT = a.lot ? new Date(a.lot.createdAt).getTime() : Infinity;
          const bT = b.lot ? new Date(b.lot.createdAt).getTime() : Infinity;
          return aT - bT;
        });
        break;

      case PickStrategy.FEFO:
        rich.sort((a, b) => {
          if (!a.lot?.expiryDate && !b.lot?.expiryDate) return 0;
          if (!a.lot?.expiryDate) return 1;
          if (!b.lot?.expiryDate) return -1;
          return new Date(a.lot.expiryDate).getTime() - new Date(b.lot.expiryDate).getTime();
        });
        break;

      case PickStrategy.ZONE:
        rich.sort((a, b) => {
          const za = a.bin?.zone ?? '';
          const zb = b.bin?.zone ?? '';
          if (za !== zb) return za.localeCompare(zb);
          const aa = a.bin?.aisle ?? '';
          const ab = b.bin?.aisle ?? '';
          if (aa !== ab) return aa.localeCompare(ab);
          return (a.bin?.rack ?? '').localeCompare(b.bin?.rack ?? '');
        });
        break;
    }

    const picks: PickSuggestion[] = [];
    let remaining = qtyNeeded;

    for (const r of rich) {
      if (remaining <= 0) break;
      const suggestedQty = Math.min(remaining, r.availableQty);
      picks.push({
        sequence: picks.length + 1,
        binLocationId: r.bs.binLocationId,
        binCode: r.bin?.code ?? r.bs.binLocationId,
        zone: r.bin?.zone ?? null,
        aisle: r.bin?.aisle ?? null,
        rack: r.bin?.rack ?? null,
        lotSerialId: r.bs.lotSerialId,
        lotNumber: r.lot?.lotNumber ?? null,
        expiryDate: r.lot?.expiryDate ?? null,
        availableQty: r.availableQty,
        suggestedQty,
      });
      remaining -= suggestedQty;
    }

    return picks;
  }
}
