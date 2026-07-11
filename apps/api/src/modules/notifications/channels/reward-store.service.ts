import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RewardCatalogItem, RewardRedemption, RedemptionStatus } from './entities/reward.entity';
import { RewardFulfillmentAdapter } from './reward.adapter';
import { AutomationService } from '../../automation/automation.service';

@Injectable()
export class RewardStoreService {
  constructor(
    @InjectRepository(RewardCatalogItem) private readonly itemRepo: Repository<RewardCatalogItem>,
    @InjectRepository(RewardRedemption) private readonly redemptionRepo: Repository<RewardRedemption>,
    private readonly fulfillment: RewardFulfillmentAdapter,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  async createItem(tenantId: string, dto: { name: string; description?: string; category?: string; pointsCost: number; stock?: number }): Promise<RewardCatalogItem> {
    if (!dto.name?.trim() || !(dto.pointsCost > 0)) throw new BadRequestException('name and a positive pointsCost are required');
    return this.itemRepo.save(this.itemRepo.create({
      tenantId, name: dto.name.trim(), description: dto.description ?? null, category: dto.category ?? null,
      pointsCost: Math.round(dto.pointsCost), stock: dto.stock ?? null, active: true,
    }));
  }

  listItems(tenantId: string, activeOnly = true): Promise<RewardCatalogItem[]> {
    const where: any = { tenantId };
    if (activeOnly) where.active = true;
    return this.itemRepo.find({ where, order: { pointsCost: 'ASC' } });
  }

  /**
   * Redeem an item. Validates affordability (against the caller-supplied
   * available balance) and stock, decrements stock, records a REQUESTED
   * redemption, and hands off to the fulfillment seam. Points debiting is the
   * caller's concern (recognition ledger); this returns pointsSpent so the
   * ledger can be debited atomically upstream.
   */
  async redeem(tenantId: string, userId: string, itemId: string, availablePoints: number): Promise<RewardRedemption> {
    const item = await this.itemRepo.findOne({ where: { id: itemId, tenantId } });
    if (!item || !item.active) throw new NotFoundException(`Reward item ${itemId} not found or inactive`);
    if (Number(availablePoints) < item.pointsCost) throw new BadRequestException(`Insufficient points: need ${item.pointsCost}, have ${availablePoints}`);
    if (item.stock != null) {
      if (item.stock <= 0) throw new BadRequestException('This reward is out of stock');
      item.stock -= 1;
      await this.itemRepo.save(item);
    }
    const redemption = await this.redemptionRepo.save(this.redemptionRepo.create({
      tenantId, userId, itemId, itemName: item.name, pointsSpent: item.pointsCost, status: RedemptionStatus.REQUESTED,
    }));
    const result = await this.fulfillment.fulfill({ name: item.name }, { id: redemption.id, userId });
    if (result.fulfilled) {
      redemption.status = RedemptionStatus.FULFILLED;
      redemption.fulfillmentRef = result.reference ?? null;
      await this.redemptionRepo.save(redemption);
    }
    await this.automation?.emit(tenantId, 'reward.redeemed', {
      redemptionId: redemption.id, userId, itemId, itemName: item.name, pointsSpent: item.pointsCost, fulfilled: result.fulfilled,
    });
    return redemption;
  }

  listRedemptions(tenantId: string, filter: { userId?: string; status?: RedemptionStatus }): Promise<RewardRedemption[]> {
    const where: any = { tenantId };
    if (filter.userId) where.userId = filter.userId;
    if (filter.status) where.status = filter.status;
    return this.redemptionRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async setRedemptionStatus(tenantId: string, id: string, status: RedemptionStatus, fulfillmentRef?: string): Promise<RewardRedemption> {
    const r = await this.redemptionRepo.findOne({ where: { id, tenantId } });
    if (!r) throw new NotFoundException(`Redemption ${id} not found`);
    // Restock on cancel/reject.
    if ((status === RedemptionStatus.CANCELLED || status === RedemptionStatus.REJECTED) && r.status === RedemptionStatus.REQUESTED) {
      const item = await this.itemRepo.findOne({ where: { id: r.itemId, tenantId } });
      if (item && item.stock != null) { item.stock += 1; await this.itemRepo.save(item); }
    }
    r.status = status;
    if (fulfillmentRef) r.fulfillmentRef = fulfillmentRef;
    return this.redemptionRepo.save(r);
  }
}
