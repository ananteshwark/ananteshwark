import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RewardCatalogItem, RewardRedemption, RedemptionStatus } from './entities/reward.entity';
import { RewardFulfillmentAdapter } from './reward.adapter';
import { AutomationService } from '../../automation/automation.service';
import { RecognitionService } from '../../engagement/recognition.service';

@Injectable()
export class RewardStoreService {
  constructor(
    @InjectRepository(RewardCatalogItem) private readonly itemRepo: Repository<RewardCatalogItem>,
    @InjectRepository(RewardRedemption) private readonly redemptionRepo: Repository<RewardRedemption>,
    private readonly fulfillment: RewardFulfillmentAdapter,
    @Optional() private readonly automation?: AutomationService,
    @Optional() private readonly recognition?: RecognitionService,
  ) {}

  /**
   * Point balance from the recognition ledger: points earned via recognitions
   * minus points held by live (requested/fulfilled) redemptions.
   */
  async balance(tenantId: string, employeeId: string): Promise<{ earned: number; spent: number; available: number }> {
    if (!this.recognition) throw new BadRequestException('The recognition ledger is not connected in this deployment');
    const earned = await this.recognition.pointsFor(tenantId, employeeId);
    const redemptions = await this.redemptionRepo.find({ where: { tenantId, userId: employeeId } });
    const spent = redemptions
      .filter((r) => r.status === RedemptionStatus.REQUESTED || r.status === RedemptionStatus.FULFILLED)
      .reduce((sum, r) => sum + Number(r.pointsSpent || 0), 0);
    return { earned, spent, available: earned - spent };
  }

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
   * Redeem an item. Affordability comes from the recognition ledger via
   * balance() when it is connected; a caller-supplied availablePoints
   * overrides it (and is required when the ledger is not wired). Validates
   * stock, decrements it, records a REQUESTED redemption, and hands off to
   * the fulfillment seam. Live redemptions count as spent in balance(), so
   * the debit is inherent — no separate ledger write is needed.
   */
  async redeem(tenantId: string, userId: string, itemId: string, availablePoints?: number): Promise<RewardRedemption> {
    const item = await this.itemRepo.findOne({ where: { id: itemId, tenantId } });
    if (!item || !item.active) throw new NotFoundException(`Reward item ${itemId} not found or inactive`);
    const points = availablePoints != null
      ? Number(availablePoints)
      : this.recognition
        ? (await this.balance(tenantId, userId)).available
        : null;
    if (points == null) throw new BadRequestException('availablePoints is required when the recognition ledger is not connected');
    if (points < item.pointsCost) throw new BadRequestException(`Insufficient points: need ${item.pointsCost}, have ${points}`);
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
