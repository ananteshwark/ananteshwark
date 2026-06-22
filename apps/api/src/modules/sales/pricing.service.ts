import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PricingCondition, ConditionType, ConditionKeyType,
} from './entities/pricing-condition.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CalculatePriceInput {
  itemId?: string | null;
  customerId?: string | null;
  quantity: number;
  date?: string;
}

export interface PriceConditionLine {
  type: ConditionType;
  rate: number;
  amount: number;
  description: string | null;
}

export interface PriceResult {
  basePrice: number;
  discountAmount: number;
  surchargeAmount: number;
  netPrice: number;
  conditions: PriceConditionLine[];
}

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(PricingCondition)
    private readonly repo: Repository<PricingCondition>,
  ) {}

  async list(tenantId: string): Promise<PricingCondition[]> {
    return this.repo.find({
      where: { tenantId },
      order: { priority: 'ASC', createdAt: 'DESC' },
    });
  }

  async create(tenantId: string, dto: Partial<PricingCondition>): Promise<PricingCondition> {
    return this.repo.save(this.repo.create({ ...dto, tenantId }));
  }

  async update(tenantId: string, id: string, dto: Partial<PricingCondition>): Promise<PricingCondition> {
    const cond = await this.repo.findOne({ where: { tenantId, id } });
    if (!cond) throw new NotFoundException(`Pricing condition ${id} not found`);
    Object.assign(cond, dto);
    return this.repo.save(cond);
  }

  async remove(tenantId: string, id: string): Promise<{ id: string; deleted: true }> {
    const cond = await this.repo.findOne({ where: { tenantId, id } });
    if (!cond) throw new NotFoundException(`Pricing condition ${id} not found`);
    cond.isActive = false;
    await this.repo.save(cond);
    return { id, deleted: true };
  }

  /**
   * Find matching active conditions for the given key, ordered by priority.
   * Considers, in this precedence: CUSTOMER_ITEM, CUSTOMER, ITEM, ALL.
   */
  async calculatePrice(tenantId: string, input: CalculatePriceInput): Promise<PriceResult> {
    const quantity = input.quantity ?? 1;
    const date = (input.date || new Date().toISOString().slice(0, 10)).slice(0, 10);

    const all = await this.repo.find({
      where: { tenantId, isActive: true },
      order: { priority: 'ASC', createdAt: 'ASC' },
    });

    const matches = all.filter((c) => {
      // Key matching
      switch (c.keyType) {
        case ConditionKeyType.CUSTOMER_ITEM:
          if (!input.customerId || !input.itemId) return false;
          if (c.customerId !== input.customerId || c.itemId !== input.itemId) return false;
          break;
        case ConditionKeyType.CUSTOMER:
          if (!input.customerId || c.customerId !== input.customerId) return false;
          break;
        case ConditionKeyType.ITEM:
          if (!input.itemId || c.itemId !== input.itemId) return false;
          break;
        case ConditionKeyType.ALL:
          break;
        default:
          return false;
      }
      // Date validity
      if (c.validFrom && date < c.validFrom) return false;
      if (c.validTo && date > c.validTo) return false;
      // Quantity range
      if (c.minQty != null && quantity < c.minQty) return false;
      if (c.maxQty != null && quantity > c.maxQty) return false;
      return true;
    });

    // Sort by key specificity then priority (lower priority number = applied first)
    const keyRank: Record<ConditionKeyType, number> = {
      [ConditionKeyType.CUSTOMER_ITEM]: 0,
      [ConditionKeyType.CUSTOMER]: 1,
      [ConditionKeyType.ITEM]: 2,
      [ConditionKeyType.ALL]: 3,
    };
    matches.sort((a, b) =>
      a.priority - b.priority ||
      keyRank[a.keyType] - keyRank[b.keyType],
    );

    const conditions: PriceConditionLine[] = [];

    // BASE_PRICE: take the highest-precedence (first) base price condition.
    const baseCond = matches
      .filter((c) => c.conditionType === ConditionType.BASE_PRICE)
      .sort((a, b) => keyRank[a.keyType] - keyRank[b.keyType] || a.priority - b.priority)[0];

    let basePrice = baseCond ? round2(baseCond.rate) : 0;
    if (baseCond) {
      conditions.push({
        type: ConditionType.BASE_PRICE,
        rate: baseCond.rate,
        amount: basePrice,
        description: baseCond.description,
      });
    }

    let discountAmount = 0;
    let surchargeAmount = 0;

    // Discounts
    for (const c of matches) {
      if (c.conditionType === ConditionType.DISCOUNT_PERCENT) {
        const amt = round2(basePrice * (c.rate / 100));
        discountAmount += amt;
        conditions.push({ type: c.conditionType, rate: c.rate, amount: amt, description: c.description });
      } else if (c.conditionType === ConditionType.DISCOUNT_AMOUNT) {
        const amt = round2(c.rate);
        discountAmount += amt;
        conditions.push({ type: c.conditionType, rate: c.rate, amount: amt, description: c.description });
      }
    }

    // Surcharges
    for (const c of matches) {
      if (c.conditionType === ConditionType.SURCHARGE_PERCENT) {
        const amt = round2(basePrice * (c.rate / 100));
        surchargeAmount += amt;
        conditions.push({ type: c.conditionType, rate: c.rate, amount: amt, description: c.description });
      } else if (c.conditionType === ConditionType.SURCHARGE_AMOUNT) {
        const amt = round2(c.rate);
        surchargeAmount += amt;
        conditions.push({ type: c.conditionType, rate: c.rate, amount: amt, description: c.description });
      }
    }

    discountAmount = round2(discountAmount);
    surchargeAmount = round2(surchargeAmount);
    const netPrice = round2(Math.max(0, basePrice - discountAmount + surchargeAmount));

    return { basePrice, discountAmount, surchargeAmount, netPrice, conditions };
  }
}
