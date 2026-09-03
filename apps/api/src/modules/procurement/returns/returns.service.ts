import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PurchaseReturn,
  PurchaseReturnStatus,
} from './entities/purchase-return.entity';
import { PurchaseReturnLine } from './entities/purchase-return-line.entity';
import { CreatePurchaseReturnDto } from './dto/purchase-return.dto';
import { InventoryService } from '../../inventory/inventory.service';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(PurchaseReturn)
    private readonly returnRepo: Repository<PurchaseReturn>,
    @InjectRepository(PurchaseReturnLine)
    private readonly lineRepo: Repository<PurchaseReturnLine>,
    private readonly inventoryService: InventoryService,
  ) {}

  private async nextNumber(tenantId: string): Promise<string> {
    const row = await this.returnRepo
      .createQueryBuilder('e')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(e.return_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('e.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `PRTN-${String(next).padStart(6, '0')}`;
  }

  async create(tenantId: string, dto: CreatePurchaseReturnDto): Promise<any> {
    const computed = dto.lines.map((l) => {
      const unitCost = l.unitCost ?? 0;
      return { ...l, unitCost, amount: round2(l.quantity * unitCost) };
    });
    const totalAmount = round2(computed.reduce((s, l) => s + l.amount, 0));

    const returnNumber = await this.nextNumber(tenantId);
    const ret = this.returnRepo.create({
      tenantId,
      returnNumber,
      grnId: dto.grnId ?? null,
      poId: dto.poId ?? null,
      vendorId: dto.vendorId,
      returnDate: dto.returnDate,
      reason: dto.reason ?? null,
      status: PurchaseReturnStatus.DRAFT,
      totalAmount,
    });
    const saved = await this.returnRepo.save(ret);

    const lineEntities = computed.map((l) =>
      this.lineRepo.create({
        tenantId,
        returnId: saved.id,
        itemId: l.itemId ?? null,
        itemCode: l.itemCode ?? null,
        itemDescription: l.itemDescription ?? null,
        quantity: l.quantity,
        unitCost: l.unitCost,
        amount: l.amount,
      }),
    );
    await this.lineRepo.save(lineEntities);

    return this.findOne(tenantId, saved.id);
  }

  async findAll(
    tenantId: string,
    filters: { vendorId?: string; status?: PurchaseReturnStatus },
  ): Promise<PurchaseReturn[]> {
    const where: any = { tenantId };
    if (filters.vendorId) where.vendorId = filters.vendorId;
    if (filters.status) where.status = filters.status;
    return this.returnRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(tenantId: string, id: string): Promise<any> {
    const ret = await this.returnRepo.findOne({ where: { id, tenantId } });
    if (!ret) throw new NotFoundException(`Purchase return ${id} not found`);
    const lines = await this.lineRepo.find({ where: { returnId: id, tenantId } });
    return { ...ret, lines };
  }

  /**
   * Post a return: reverse stock for each line (issue stock out of the best
   * available warehouse) and produce the debit-note amount.
   */
  async postReturn(tenantId: string, id: string): Promise<any> {
    const ret = await this.returnRepo.findOne({ where: { id, tenantId } });
    if (!ret) throw new NotFoundException(`Purchase return ${id} not found`);
    if (ret.status !== PurchaseReturnStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT returns can be posted');
    }
    const lines = await this.lineRepo.find({ where: { returnId: id, tenantId } });

    for (const line of lines) {
      const qty = Number(line.quantity);
      if (qty <= 0) continue;

      // Resolve item: prefer explicit itemId, else look up by itemCode.
      let itemId = line.itemId;
      if (!itemId && line.itemCode) {
        const item = await this.inventoryService.findItemByCode(tenantId, line.itemCode);
        itemId = item?.id ?? null;
      }
      if (!itemId) continue; // non-stock / service return — no stock movement

      try {
        const balance = await this.inventoryService.findBestBalanceForItem(tenantId, itemId);
        const warehouseId = balance?.warehouseId;
        if (!warehouseId) continue;
        await this.inventoryService.issueStock(
          tenantId,
          itemId,
          warehouseId,
          qty,
          'PURCHASE_RETURN',
          id,
          ret.returnDate,
          `Return to vendor ${ret.returnNumber}`,
        );
      } catch (e: any) {
        console.warn(`Stock reversal failed for return line ${line.id}:`, e.message);
      }
    }

    ret.status = PurchaseReturnStatus.POSTED;
    await this.returnRepo.save(ret);

    const result = await this.findOne(tenantId, id);
    return { ...result, debitNoteAmount: ret.totalAmount };
  }
}
