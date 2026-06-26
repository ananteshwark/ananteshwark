import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ApHold, ApHoldType, ApHoldStatus } from './entities/ap-hold.entity';
import { Bill } from './entities/bill.entity';

@Injectable()
export class ApHoldService {
  constructor(
    @InjectRepository(ApHold) private readonly holdRepo: Repository<ApHold>,
    @InjectRepository(Bill) private readonly billRepo: Repository<Bill>,
  ) {}

  async listHolds(
    tenantId: string,
    params: { billId?: string; status?: ApHoldStatus } = {},
  ): Promise<ApHold[]> {
    const where: any = { tenantId };
    if (params.billId) where.billId = params.billId;
    if (params.status) where.status = params.status;
    return this.holdRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async placeHold(
    tenantId: string,
    data: { billId: string; holdType: ApHoldType; reason: string; placedById?: string },
  ): Promise<ApHold> {
    if (!data.billId) throw new BadRequestException('billId is required');
    if (!data.reason) throw new BadRequestException('reason is required');
    const bill = await this.billRepo.findOne({ where: { id: data.billId, tenantId } });
    if (!bill) throw new NotFoundException(`Bill ${data.billId} not found`);

    // prevent duplicate active hold of the same type
    const existing = await this.holdRepo.findOne({
      where: { tenantId, billId: data.billId, holdType: data.holdType, status: ApHoldStatus.ACTIVE },
    });
    if (existing) {
      throw new BadRequestException(`An active ${data.holdType} hold already exists on this bill`);
    }

    const hold = this.holdRepo.create({
      tenantId,
      billId: data.billId,
      holdType: data.holdType,
      status: ApHoldStatus.ACTIVE,
      reason: data.reason,
      placedById: data.placedById ?? null,
    } as any) as unknown as ApHold;
    return (this.holdRepo.save(hold) as unknown) as Promise<ApHold>;
  }

  async releaseHold(
    tenantId: string,
    id: string,
    data: { releaseReason: string; releasedById?: string },
  ): Promise<ApHold> {
    const hold = await this.holdRepo.findOne({ where: { id, tenantId } });
    if (!hold) throw new NotFoundException(`Hold ${id} not found`);
    if (hold.status === ApHoldStatus.RELEASED) {
      throw new BadRequestException('Hold is already released');
    }
    if (!data.releaseReason) throw new BadRequestException('releaseReason is required');
    hold.status = ApHoldStatus.RELEASED;
    hold.releaseReason = data.releaseReason;
    hold.releasedById = data.releasedById ?? null;
    hold.releasedAt = new Date();
    return (this.holdRepo.save(hold) as unknown) as Promise<ApHold>;
  }

  /** Does the given bill currently have any ACTIVE hold? */
  async isBillHeld(tenantId: string, billId: string): Promise<boolean> {
    const count = await this.holdRepo.count({
      where: { tenantId, billId, status: ApHoldStatus.ACTIVE },
    });
    return count > 0;
  }

  /** Throw if the bill is held — used to block direct payment. */
  async assertBillNotHeld(tenantId: string, billId: string): Promise<void> {
    if (await this.isBillHeld(tenantId, billId)) {
      throw new BadRequestException('Bill is on hold and cannot be paid until released');
    }
  }

  /**
   * Given a set of bill IDs, return the subset that currently has an ACTIVE
   * hold. Used by the payment run to exclude held bills from the proposal.
   */
  async getHeldBillIds(tenantId: string, billIds: string[]): Promise<Set<string>> {
    if (billIds.length === 0) return new Set();
    const holds = await this.holdRepo.find({
      where: { tenantId, billId: In([...new Set(billIds)]), status: ApHoldStatus.ACTIVE },
    });
    return new Set(holds.map((h) => h.billId));
  }
}
