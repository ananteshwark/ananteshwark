import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IcTransferPrice,
  TransferPricingMethod,
} from './entities/ic-transfer-price.entity';
import {
  CreateTransferPriceDto,
  UpdateTransferPriceDto,
} from './dto/intercompany.dto';

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

export interface TransferPriceResolution {
  resolved: boolean;
  method: TransferPricingMethod | null;
  unitPrice: number | null;
  currency: string | null;
  ruleId: string | null;
  /** true when an item-specific rule matched, false for a pair default */
  itemSpecific: boolean;
}

@Injectable()
export class TransferPricingService {
  constructor(
    @InjectRepository(IcTransferPrice)
    private readonly priceRepo: Repository<IcTransferPrice>,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateTransferPriceDto): Promise<IcTransferPrice> {
    if (dto.sellingEntityId === dto.buyingEntityId) {
      throw new BadRequestException('Selling and buying entity must differ');
    }
    this.assertMethodParams(dto.method, dto);
    const rule = this.priceRepo.create({
      tenantId,
      sellingEntityId: dto.sellingEntityId,
      buyingEntityId: dto.buyingEntityId,
      itemCode: dto.itemCode ?? null,
      method: dto.method,
      costPlusPercent: dto.costPlusPercent ?? 0,
      fixedPrice: dto.fixedPrice ?? null,
      marketPrice: dto.marketPrice ?? null,
      currency: dto.currency ?? 'USD',
      validFrom: dto.validFrom,
      validTo: dto.validTo ?? null,
      isActive: true,
      description: dto.description ?? null,
    } as any);
    return (this.priceRepo.save(rule) as unknown) as Promise<IcTransferPrice>;
  }

  async update(tenantId: string, id: string, dto: UpdateTransferPriceDto): Promise<IcTransferPrice> {
    const rule = await this.priceRepo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`Transfer price ${id} not found`);
    if (dto.method !== undefined) rule.method = dto.method;
    if (dto.costPlusPercent !== undefined) rule.costPlusPercent = dto.costPlusPercent;
    if (dto.fixedPrice !== undefined) rule.fixedPrice = dto.fixedPrice;
    if (dto.marketPrice !== undefined) rule.marketPrice = dto.marketPrice;
    if (dto.validTo !== undefined) rule.validTo = dto.validTo;
    if (dto.isActive !== undefined) rule.isActive = dto.isActive;
    if (dto.description !== undefined) rule.description = dto.description;
    this.assertMethodParams(rule.method, rule);
    return (this.priceRepo.save(rule) as unknown) as Promise<IcTransferPrice>;
  }

  async list(
    tenantId: string,
    filters: { sellingEntityId?: string; buyingEntityId?: string; itemCode?: string } = {},
  ): Promise<IcTransferPrice[]> {
    const qb = this.priceRepo
      .createQueryBuilder('tp')
      .where('tp.tenant_id = :tenantId', { tenantId });
    if (filters.sellingEntityId)
      qb.andWhere('tp.selling_entity_id = :s', { s: filters.sellingEntityId });
    if (filters.buyingEntityId)
      qb.andWhere('tp.buying_entity_id = :b', { b: filters.buyingEntityId });
    if (filters.itemCode) qb.andWhere('tp.item_code = :i', { i: filters.itemCode });
    return qb.orderBy('tp.valid_from', 'DESC').getMany();
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const rule = await this.priceRepo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`Transfer price ${id} not found`);
    await this.priceRepo.remove(rule);
  }

  // ─── Computation ─────────────────────────────────────────────────────────────

  /** Compute a unit transfer price from a rule + optional base cost. */
  computePrice(rule: IcTransferPrice, baseCost?: number): number {
    switch (rule.method) {
      case TransferPricingMethod.COST_PLUS: {
        const cost = baseCost ?? 0;
        return round4(cost * (1 + Number(rule.costPlusPercent) / 100));
      }
      case TransferPricingMethod.FIXED:
        return round4(Number(rule.fixedPrice ?? 0));
      case TransferPricingMethod.MARKET:
        return round4(Number(rule.marketPrice ?? 0));
      default:
        return 0;
    }
  }

  /**
   * Resolve the applicable transfer price for an entity pair / item / date.
   * An item-specific active rule wins over a pair-default rule.
   */
  async resolve(
    tenantId: string,
    opts: {
      sellingEntityId: string;
      buyingEntityId: string;
      itemCode?: string;
      baseCost?: number;
      asOf?: string;
    },
  ): Promise<TransferPriceResolution> {
    const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
    const candidates = await this.priceRepo
      .createQueryBuilder('tp')
      .where('tp.tenant_id = :tenantId', { tenantId })
      .andWhere('tp.selling_entity_id = :s', { s: opts.sellingEntityId })
      .andWhere('tp.buying_entity_id = :b', { b: opts.buyingEntityId })
      .andWhere('tp.is_active = true')
      .andWhere('tp.valid_from <= :asOf', { asOf })
      .andWhere('(tp.valid_to IS NULL OR tp.valid_to >= :asOf)', { asOf })
      .getMany();

    if (!candidates.length) {
      return { resolved: false, method: null, unitPrice: null, currency: null, ruleId: null, itemSpecific: false };
    }

    // Prefer an item-specific rule; fall back to the pair default (null itemCode).
    const itemRule = opts.itemCode
      ? candidates.find(c => c.itemCode === opts.itemCode)
      : undefined;
    const defaultRule = candidates.find(c => c.itemCode == null);
    const chosen = itemRule ?? defaultRule ?? candidates[0];

    return {
      resolved: true,
      method: chosen.method,
      unitPrice: this.computePrice(chosen, opts.baseCost),
      currency: chosen.currency,
      ruleId: chosen.id,
      itemSpecific: !!itemRule,
    };
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  private assertMethodParams(
    method: TransferPricingMethod,
    p: { fixedPrice?: number | null; marketPrice?: number | null },
  ): void {
    if (method === TransferPricingMethod.FIXED && (p.fixedPrice == null || p.fixedPrice <= 0)) {
      throw new BadRequestException('fixedPrice is required for the FIXED method');
    }
    if (method === TransferPricingMethod.MARKET && (p.marketPrice == null || p.marketPrice <= 0)) {
      throw new BadRequestException('marketPrice is required for the MARKET method');
    }
  }
}
