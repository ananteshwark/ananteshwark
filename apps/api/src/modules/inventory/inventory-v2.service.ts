import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BinLocation } from './entities/bin-location.entity';
import { LotSerial, LotStatus } from './entities/lot-serial.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { CycleCount, CycleCountLine, CycleCountStatus, CycleCountLineStatus } from './entities/cycle-count.entity';
import { Rma, RmaStatus } from './entities/rma.entity';
import { StockBalance } from './entities/stock-balance.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';

@Injectable()
export class InventoryV2Service {
  constructor(
    @InjectRepository(BinLocation) private readonly binRepo: Repository<BinLocation>,
    @InjectRepository(LotSerial) private readonly lotRepo: Repository<LotSerial>,
    @InjectRepository(UomConversion) private readonly uomRepo: Repository<UomConversion>,
    @InjectRepository(CycleCount) private readonly countRepo: Repository<CycleCount>,
    @InjectRepository(CycleCountLine) private readonly countLineRepo: Repository<CycleCountLine>,
    @InjectRepository(Rma) private readonly rmaRepo: Repository<Rma>,
    @InjectRepository(StockBalance) private readonly balanceRepo: Repository<StockBalance>,
  ) {}

  // ---- Bin Locations ----
  async createBin(tenantId: string, dto: Partial<BinLocation>): Promise<BinLocation> {
    return this.binRepo.save(this.binRepo.create({ ...dto, tenantId }));
  }

  async listBins(tenantId: string, warehouseId?: string): Promise<BinLocation[]> {
    const where: any = { tenantId, isActive: true };
    if (warehouseId) where.warehouseId = warehouseId;
    return this.binRepo.find({ where, order: { code: 'ASC' } });
  }

  // ---- Lot / Serial Tracking ----
  async receiveLot(tenantId: string, dto: Partial<LotSerial>): Promise<LotSerial> {
    const lot = this.lotRepo.create({ ...dto, tenantId, availableQty: dto.receivedQty ?? 0 });
    return this.lotRepo.save(lot);
  }

  async listLots(tenantId: string, itemId?: string): Promise<LotSerial[]> {
    const where: any = { tenantId };
    if (itemId) where.itemId = itemId;
    return this.lotRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async quarantineLot(tenantId: string, id: string): Promise<LotSerial> {
    const lot = await this.lotRepo.findOne({ where: { tenantId, id } });
    if (!lot) throw new NotFoundException(`Lot ${id} not found`);
    lot.status = LotStatus.QUARANTINE;
    return this.lotRepo.save(lot);
  }

  // ---- UoM Conversions ----
  async createConversion(tenantId: string, dto: Partial<UomConversion>): Promise<UomConversion> {
    return this.uomRepo.save(this.uomRepo.create({ ...dto, tenantId }));
  }

  async listConversions(tenantId: string, itemId?: string): Promise<UomConversion[]> {
    const where: any = { tenantId };
    if (itemId) where.itemId = itemId;
    return this.uomRepo.find({ where });
  }

  convertQty(qty: number, factor: number): number {
    return Math.round(qty * factor * 10000) / 10000;
  }

  // ---- Cycle Counting ----
  private async nextCountNumber(tenantId: string): Promise<string> {
    const row = await this.countRepo
      .createQueryBuilder('c')
      .select(`MAX(CAST(NULLIF(regexp_replace(c.count_number, '\\D', '', 'g'), '') AS INTEGER))`, 'mx')
      .where('c.tenantId = :tenantId', { tenantId })
      .getRawOne();
    return `CC-${String((row?.mx ?? 0) + 1).padStart(6, '0')}`;
  }

  async createCycleCount(tenantId: string, dto: { warehouseId: string; countDate: string; notes?: string; itemIds?: string[] }): Promise<CycleCount> {
    const countNumber = await this.nextCountNumber(tenantId);
    const count = await this.countRepo.save(this.countRepo.create({ ...dto, tenantId, countNumber }));

    const where: any = { tenantId, warehouseId: dto.warehouseId };
    const balances = await this.balanceRepo.find({ where });

    const lines = balances
      .filter(b => !dto.itemIds || dto.itemIds.includes(b.itemId))
      .map(b => this.countLineRepo.create({ tenantId, countId: count.id, itemId: b.itemId, systemQty: b.qtyOnHand }));

    if (lines.length > 0) await this.countLineRepo.save(lines);
    count.status = CycleCountStatus.COUNTING;
    return this.countRepo.save(count);
  }

  async listCycleCounts(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<CycleCount>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.countRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getCountLines(tenantId: string, countId: string): Promise<CycleCountLine[]> {
    return this.countLineRepo.find({ where: { tenantId, countId } });
  }

  async enterCountedQty(tenantId: string, lineId: string, countedQty: number): Promise<CycleCountLine> {
    const line = await this.countLineRepo.findOne({ where: { tenantId, id: lineId } });
    if (!line) throw new NotFoundException(`Count line ${lineId} not found`);
    line.countedQty = countedQty;
    line.varianceQty = countedQty - line.systemQty;
    line.status = Math.abs(line.varianceQty) > 0.0001 ? CycleCountLineStatus.VARIANCE : CycleCountLineStatus.ACCEPTED;
    return this.countLineRepo.save(line);
  }

  async postCycleCount(tenantId: string, countId: string): Promise<CycleCount> {
    const count = await this.countRepo.findOne({ where: { tenantId, id: countId } });
    if (!count) throw new NotFoundException(`Cycle count ${countId} not found`);
    if (count.status !== CycleCountStatus.COUNTING && count.status !== CycleCountStatus.REVIEWED) {
      throw new BadRequestException('Cycle count must be COUNTING or REVIEWED to post');
    }
    count.status = CycleCountStatus.POSTED;
    return this.countRepo.save(count);
  }

  // ---- RMA ----
  private async nextRmaNumber(tenantId: string): Promise<string> {
    const row = await this.rmaRepo
      .createQueryBuilder('r')
      .select(`MAX(CAST(NULLIF(regexp_replace(r.rma_number, '\\D', '', 'g'), '') AS INTEGER))`, 'mx')
      .where('r.tenantId = :tenantId', { tenantId })
      .getRawOne();
    return `RMA-${String((row?.mx ?? 0) + 1).padStart(6, '0')}`;
  }

  async createRma(tenantId: string, dto: Partial<Rma>): Promise<Rma> {
    const rmaNumber = await this.nextRmaNumber(tenantId);
    const totalValue = (dto.lines ?? []).reduce((s, l) => s + l.qty * l.unitCost, 0);
    return this.rmaRepo.save(this.rmaRepo.create({ ...dto, tenantId, rmaNumber, totalValue }));
  }

  async listRmas(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<Rma>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.rmaRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async approveRma(tenantId: string, id: string): Promise<Rma> {
    const rma = await this.rmaRepo.findOne({ where: { tenantId, id } });
    if (!rma) throw new NotFoundException(`RMA ${id} not found`);
    if (rma.status !== RmaStatus.DRAFT) throw new BadRequestException('RMA must be DRAFT to approve');
    rma.status = RmaStatus.APPROVED;
    return this.rmaRepo.save(rma);
  }

  async receiveRma(tenantId: string, id: string, receivedDate: string): Promise<Rma> {
    const rma = await this.rmaRepo.findOne({ where: { tenantId, id } });
    if (!rma) throw new NotFoundException(`RMA ${id} not found`);
    if (rma.status !== RmaStatus.APPROVED) throw new BadRequestException('RMA must be APPROVED to receive');
    rma.status = RmaStatus.RECEIVED;
    rma.receivedDate = receivedDate;
    return this.rmaRepo.save(rma);
  }
}
