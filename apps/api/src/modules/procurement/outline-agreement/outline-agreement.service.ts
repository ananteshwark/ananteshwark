import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OutlineAgreement,
  OutlineAgreementStatus,
  OutlineAgreementType,
} from './entities/outline-agreement.entity';
import {
  CreateOutlineAgreementDto,
  UpdateOutlineAgreementDto,
  RecordReleaseDto,
} from './dto/outline-agreement.dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

@Injectable()
export class OutlineAgreementService {
  constructor(
    @InjectRepository(OutlineAgreement)
    private readonly repo: Repository<OutlineAgreement>,
  ) {}

  private async nextNumber(tenantId: string): Promise<string> {
    const row = await this.repo
      .createQueryBuilder('e')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(e.agreement_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('e.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `OA-${String(next).padStart(4, '0')}`;
  }

  async findAll(
    tenantId: string,
    filters: { vendorId?: string; status?: OutlineAgreementStatus },
  ): Promise<OutlineAgreement[]> {
    const where: any = { tenantId };
    if (filters.vendorId) where.vendorId = filters.vendorId;
    if (filters.status) where.status = filters.status;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(tenantId: string, id: string): Promise<OutlineAgreement> {
    const agreement = await this.repo.findOne({ where: { id, tenantId } });
    if (!agreement) throw new NotFoundException(`Outline agreement ${id} not found`);
    return agreement;
  }

  async create(tenantId: string, dto: CreateOutlineAgreementDto): Promise<OutlineAgreement> {
    if (dto.type === OutlineAgreementType.VALUE_CONTRACT && (dto.targetValue === undefined || dto.targetValue === null)) {
      throw new BadRequestException('targetValue is required for a VALUE_CONTRACT');
    }
    if (dto.type === OutlineAgreementType.QUANTITY_CONTRACT && (dto.targetQuantity === undefined || dto.targetQuantity === null)) {
      throw new BadRequestException('targetQuantity is required for a QUANTITY_CONTRACT');
    }
    const agreementNumber = await this.nextNumber(tenantId);
    const agreement = this.repo.create({
      tenantId,
      agreementNumber,
      vendorId: dto.vendorId,
      vendorName: dto.vendorName ?? null,
      type: dto.type,
      description: dto.description ?? null,
      targetValue: dto.targetValue ?? null,
      targetQuantity: dto.targetQuantity ?? null,
      itemId: dto.itemId ?? null,
      itemDescription: dto.itemDescription ?? null,
      currency: dto.currency || 'INR',
      validFrom: dto.validFrom,
      validTo: dto.validTo,
      status: OutlineAgreementStatus.DRAFT,
      releasedValue: 0,
      releasedQuantity: 0,
    });
    return this.repo.save(agreement);
  }

  async update(tenantId: string, id: string, dto: UpdateOutlineAgreementDto): Promise<OutlineAgreement> {
    const agreement = await this.findOne(tenantId, id);
    if (agreement.status === OutlineAgreementStatus.CLOSED) {
      throw new BadRequestException('A CLOSED agreement cannot be updated');
    }
    if (dto.vendorName !== undefined) agreement.vendorName = dto.vendorName;
    if (dto.description !== undefined) agreement.description = dto.description;
    if (dto.targetValue !== undefined) agreement.targetValue = dto.targetValue;
    if (dto.targetQuantity !== undefined) agreement.targetQuantity = dto.targetQuantity;
    if (dto.itemId !== undefined) agreement.itemId = dto.itemId;
    if (dto.itemDescription !== undefined) agreement.itemDescription = dto.itemDescription;
    if (dto.currency !== undefined) agreement.currency = dto.currency;
    if (dto.validFrom !== undefined) agreement.validFrom = dto.validFrom;
    if (dto.validTo !== undefined) agreement.validTo = dto.validTo;
    return this.repo.save(agreement);
  }

  async activate(tenantId: string, id: string): Promise<OutlineAgreement> {
    const agreement = await this.findOne(tenantId, id);
    if (agreement.status !== OutlineAgreementStatus.DRAFT) {
      throw new BadRequestException('Only a DRAFT agreement can be activated');
    }
    agreement.status = OutlineAgreementStatus.ACTIVE;
    return this.repo.save(agreement);
  }

  async close(tenantId: string, id: string): Promise<OutlineAgreement> {
    const agreement = await this.findOne(tenantId, id);
    if (agreement.status === OutlineAgreementStatus.CLOSED) {
      throw new BadRequestException('Agreement is already closed');
    }
    agreement.status = OutlineAgreementStatus.CLOSED;
    return this.repo.save(agreement);
  }

  /**
   * Increment released value/quantity against the agreement target. Never exceeds
   * the target — clamps and returns an `overReleased` warning flag rather than throwing.
   */
  async recordRelease(
    tenantId: string,
    id: string,
    dto: RecordReleaseDto,
  ): Promise<{ agreement: OutlineAgreement; overReleased: boolean }> {
    const agreement = await this.findOne(tenantId, id);
    let overReleased = false;

    if (dto.value !== undefined && dto.value !== null && dto.value > 0) {
      const proposed = round2(agreement.releasedValue + dto.value);
      if (agreement.targetValue !== null && proposed > agreement.targetValue) {
        agreement.releasedValue = agreement.targetValue;
        overReleased = true;
      } else {
        agreement.releasedValue = proposed;
      }
    }

    if (dto.quantity !== undefined && dto.quantity !== null && dto.quantity > 0) {
      const proposed = round4(agreement.releasedQuantity + dto.quantity);
      if (agreement.targetQuantity !== null && proposed > agreement.targetQuantity) {
        agreement.releasedQuantity = agreement.targetQuantity;
        overReleased = true;
      } else {
        agreement.releasedQuantity = proposed;
      }
    }

    const saved = await this.repo.save(agreement);
    return { agreement: saved, overReleased };
  }

  async getUtilization(tenantId: string, id: string): Promise<any> {
    const agreement = await this.findOne(tenantId, id);
    const result: any = { agreementId: id, type: agreement.type };

    if (agreement.targetValue !== null) {
      const target = agreement.targetValue;
      const released = agreement.releasedValue;
      const remaining = round2(Math.max(0, target - released));
      result.value = {
        target,
        released,
        remaining,
        utilizationPercent: target > 0 ? round2((released / target) * 100) : 0,
      };
    }

    if (agreement.targetQuantity !== null) {
      const target = agreement.targetQuantity;
      const released = agreement.releasedQuantity;
      const remaining = round4(Math.max(0, target - released));
      result.quantity = {
        target,
        released,
        remaining,
        utilizationPercent: target > 0 ? round2((released / target) * 100) : 0,
      };
    }

    return result;
  }
}
