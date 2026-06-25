import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PutawayRule, PutawayRuleType } from './entities/putaway-rule.entity';
import { BinLocation } from './entities/bin-location.entity';
import { BinStock } from './entities/bin-stock.entity';

export interface PutawaySuggestion {
  binLocationId: string;
  binCode: string;
  zone: string | null;
  aisle: string | null;
  rack: string | null;
  currentQty: number;
  reason: string;
  ruleId: string | null;
  ruleName: string | null;
}

@Injectable()
export class PutawayService {
  constructor(
    @InjectRepository(PutawayRule) private readonly ruleRepo: Repository<PutawayRule>,
    @InjectRepository(BinLocation) private readonly binRepo: Repository<BinLocation>,
    @InjectRepository(BinStock) private readonly binStockRepo: Repository<BinStock>,
  ) {}

  async createRule(tenantId: string, dto: any): Promise<PutawayRule> {
    const entity = (this.ruleRepo.create({ ...dto, tenantId } as any) as unknown) as PutawayRule;
    return (this.ruleRepo.save(entity) as unknown) as Promise<PutawayRule>;
  }

  async listRules(tenantId: string, warehouseId?: string): Promise<PutawayRule[]> {
    const where: any = { tenantId };
    if (warehouseId) where.warehouseId = warehouseId;
    return this.ruleRepo.find({ where, order: { priority: 'ASC', createdAt: 'ASC' } });
  }

  async deleteRule(tenantId: string, id: string): Promise<void> {
    const rule = await this.ruleRepo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`Putaway rule ${id} not found`);
    await this.ruleRepo.remove(rule);
  }

  async suggestPutaway(
    tenantId: string,
    warehouseId: string,
    itemId: string,
    itemCategoryId: string | null,
    qty: number,
  ): Promise<PutawaySuggestion[]> {
    const rules = await this.ruleRepo.find({
      where: { tenantId, warehouseId, isActive: true },
      order: { priority: 'ASC' },
    });

    const seen = new Set<string>();
    const suggestions: PutawaySuggestion[] = [];

    const addSuggestion = async (binId: string, reason: string, ruleId: string | null, ruleName: string | null) => {
      if (seen.has(binId) || suggestions.length >= 5) return;
      seen.add(binId);
      const bin = await this.binRepo.findOne({ where: { id: binId, warehouseId, isActive: true } });
      if (!bin) return;
      const bs = await this.binStockRepo.findOne({ where: { tenantId, binLocationId: binId, itemId } as any });
      suggestions.push({
        binLocationId: bin.id, binCode: bin.code, zone: bin.zone, aisle: bin.aisle, rack: bin.rack,
        currentQty: bs ? Number(bs.qty) : 0,
        reason, ruleId, ruleName,
      });
    };

    for (const rule of rules) {
      if (suggestions.length >= 5) break;

      const itemMatches = !rule.itemId || rule.itemId === itemId;
      const catMatches = !rule.itemCategoryId || rule.itemCategoryId === itemCategoryId;
      if (!itemMatches || !catMatches) continue;

      switch (rule.ruleType) {
        case PutawayRuleType.FIXED_BIN: {
          if (rule.destBinId) {
            await addSuggestion(rule.destBinId, `Fixed bin: ${rule.name}`, rule.id, rule.name);
          }
          break;
        }

        case PutawayRuleType.ITEM_ZONE:
        case PutawayRuleType.CATEGORY_ZONE: {
          if (!rule.destZone) break;
          const zoneBins = await this.binRepo.find({
            where: { tenantId, warehouseId, zone: rule.destZone, isActive: true },
            order: { aisle: 'ASC', rack: 'ASC', bin: 'ASC' },
            take: 5,
          });
          for (const bin of zoneBins) {
            if (suggestions.length >= 5) break;
            await addSuggestion(bin.id, `Zone rule (${rule.destZone}): ${rule.name}`, rule.id, rule.name);
          }
          break;
        }

        case PutawayRuleType.CONSOLIDATE: {
          const stockedBins = await this.binStockRepo
            .createQueryBuilder('bs')
            .where('bs.tenantId = :tenantId AND bs.warehouseId = :warehouseId AND bs.itemId = :itemId AND bs.qty > 0',
              { tenantId, warehouseId, itemId })
            .orderBy('bs.qty', 'DESC')
            .take(5)
            .getMany();

          for (const bs of stockedBins) {
            if (suggestions.length >= 5) break;
            await addSuggestion(bs.binLocationId, `Consolidate with existing stock: ${rule.name}`, rule.id, rule.name);
          }
          break;
        }

        case PutawayRuleType.NEAREST_EMPTY: {
          const allBins = await this.binRepo.find({
            where: { tenantId, warehouseId, isActive: true },
            order: { zone: 'ASC', aisle: 'ASC', rack: 'ASC', bin: 'ASC' },
            take: 30,
          });
          for (const bin of allBins) {
            if (suggestions.length >= 5) break;
            if (seen.has(bin.id)) continue;
            const total = await this.binStockRepo
              .createQueryBuilder('bs')
              .select('SUM(bs.qty)', 'total')
              .where('bs.tenantId = :tenantId AND bs.binLocationId = :binId', { tenantId, binId: bin.id })
              .getRawOne();
            if (Number(total?.total ?? 0) === 0) {
              await addSuggestion(bin.id, `Nearest empty bin: ${rule.name}`, rule.id, rule.name);
            }
          }
          break;
        }
      }
    }

    // Fallback: consolidation then first-available
    if (suggestions.length === 0) {
      const stockedBins = await this.binStockRepo
        .createQueryBuilder('bs')
        .where('bs.tenantId = :tenantId AND bs.warehouseId = :warehouseId AND bs.itemId = :itemId AND bs.qty > 0',
          { tenantId, warehouseId, itemId })
        .orderBy('bs.qty', 'DESC')
        .take(3)
        .getMany();

      for (const bs of stockedBins) {
        await addSuggestion(bs.binLocationId, 'Consolidate with existing stock (default)', null, null);
      }

      if (suggestions.length === 0) {
        const emptyBins = await this.binRepo.find({
          where: { tenantId, warehouseId, isActive: true },
          order: { code: 'ASC' },
          take: 3,
        });
        for (const bin of emptyBins) {
          await addSuggestion(bin.id, 'First available bin (default)', null, null);
        }
      }
    }

    return suggestions;
  }
}
