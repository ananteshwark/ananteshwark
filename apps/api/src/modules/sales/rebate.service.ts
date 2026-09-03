import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SequenceService } from '../../common/sequence/sequence.service';
import { RebateAgreement, RebateStatus, RebateCalculationBasis } from './entities/rebate-agreement.entity';
import { SalesOrder } from './entities/sales-order.entity';

@Injectable()
export class RebateService {
  constructor(
    @InjectRepository(RebateAgreement)
    private readonly rebateRepo: Repository<RebateAgreement>,
    @InjectRepository(SalesOrder)
    private readonly orderRepo: Repository<SalesOrder>,
    private readonly sequence: SequenceService,
  ) {}

  private async nextAgreementNumber(tenantId: string): Promise<string> {
    return this.sequence.formatted(tenantId, 'rebate-agreement', 'REB-', 5);
  }

  async createAgreement(tenantId: string, dto: any): Promise<RebateAgreement> {
    const agreementNumber = dto.agreementNumber ?? await this.nextAgreementNumber(tenantId);
    const agreement = this.rebateRepo.create({ ...dto, tenantId, agreementNumber } as any);
    return (this.rebateRepo.save(agreement) as unknown) as Promise<RebateAgreement>;
  }

  async listAgreements(tenantId: string): Promise<RebateAgreement[]> {
    return this.rebateRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async getAgreement(tenantId: string, id: string): Promise<RebateAgreement> {
    const ag = await this.rebateRepo.findOne({ where: { id, tenantId } });
    if (!ag) throw new NotFoundException(`Rebate agreement ${id} not found`);
    return ag;
  }

  async updateAgreement(tenantId: string, id: string, dto: any): Promise<RebateAgreement> {
    const ag = await this.getAgreement(tenantId, id);
    Object.assign(ag, dto);
    return this.rebateRepo.save(ag);
  }

  private calculateRebateForValue(agreement: RebateAgreement, value: number): number {
    const tiers = [...agreement.tiers].sort((a, b) => a.from - b.from);
    let rebate = 0;
    for (const tier of tiers) {
      const upper = tier.to ?? Infinity;
      if (value >= tier.from && value < upper) {
        rebate = (value * tier.rebatePct) / 100;
        break;
      }
    }
    return Math.round(rebate * 100) / 100;
  }

  async accrueRebate(tenantId: string, orderId: string): Promise<{ agreement: RebateAgreement; rebateAmount: number }[]> {
    const order = await this.orderRepo.findOne({ where: { id: orderId, tenantId } });
    if (!order) throw new NotFoundException(`Sales order ${orderId} not found`);

    const today = new Date().toISOString().split('T')[0];
    const agreements = await this.rebateRepo.find({ where: { tenantId, customerId: order.customerId, status: RebateStatus.ACTIVE } });

    const results: { agreement: RebateAgreement; rebateAmount: number }[] = [];
    for (const ag of agreements) {
      if (today < ag.validFrom || today > ag.validTo) continue;
      const basis = ag.calculationBasis === RebateCalculationBasis.QUANTITY
        ? 0
        : Number(order.total);
      const rebateAmount = this.calculateRebateForValue(ag, basis);
      if (rebateAmount > 0) {
        ag.accruedAmount = Number(ag.accruedAmount) + rebateAmount;
        await this.rebateRepo.save(ag);
        results.push({ agreement: ag, rebateAmount });
      }
    }
    return results;
  }

  async simulateRebate(tenantId: string, agreementId: string, orderValue: number): Promise<{ rebateAmount: number; tier: any }> {
    const ag = await this.getAgreement(tenantId, agreementId);
    const tiers = [...ag.tiers].sort((a, b) => a.from - b.from);
    let matchedTier: any = null;
    for (const tier of tiers) {
      const upper = tier.to ?? Infinity;
      if (orderValue >= tier.from && orderValue < upper) {
        matchedTier = tier;
        break;
      }
    }
    const rebateAmount = matchedTier ? (orderValue * matchedTier.rebatePct) / 100 : 0;
    return { rebateAmount: Math.round(rebateAmount * 100) / 100, tier: matchedTier };
  }

  async settleAgreement(tenantId: string, id: string): Promise<RebateAgreement> {
    const ag = await this.getAgreement(tenantId, id);
    if (ag.status !== RebateStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE agreements can be settled');
    }
    const pendingAmount = Number(ag.accruedAmount) - Number(ag.settledAmount);
    if (pendingAmount <= 0) {
      throw new BadRequestException('No accrued amount to settle');
    }
    ag.settledAmount = Number(ag.settledAmount) + pendingAmount;
    ag.status = RebateStatus.SETTLED;
    return this.rebateRepo.save(ag);
  }
}
