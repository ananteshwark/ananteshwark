import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchasingInfoRecord } from './entities/purchasing-info-record.entity';
import { CreateInfoRecordDto, UpdateInfoRecordDto } from './dto/info-record.dto';

@Injectable()
export class InfoRecordService {
  constructor(
    @InjectRepository(PurchasingInfoRecord)
    private readonly repo: Repository<PurchasingInfoRecord>,
  ) {}

  async create(tenantId: string, dto: CreateInfoRecordDto): Promise<PurchasingInfoRecord> {
    const entity = this.repo.create({
      tenantId,
      vendorId: dto.vendorId,
      itemId: dto.itemId,
      price: dto.price,
      currency: dto.currency || 'INR',
      leadTimeDays: dto.leadTimeDays ?? 0,
      minOrderQty: dto.minOrderQty ?? null,
      validFrom: dto.validFrom ?? null,
      validTo: dto.validTo ?? null,
      lastPurchasePrice: dto.lastPurchasePrice ?? null,
      isActive: dto.isActive ?? true,
    });
    return this.repo.save(entity);
  }

  async findAll(
    tenantId: string,
    filters: { vendorId?: string; itemId?: string },
  ): Promise<PurchasingInfoRecord[]> {
    const where: any = { tenantId };
    if (filters.vendorId) where.vendorId = filters.vendorId;
    if (filters.itemId) where.itemId = filters.itemId;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(tenantId: string, id: string): Promise<PurchasingInfoRecord> {
    const rec = await this.repo.findOne({ where: { id, tenantId } });
    if (!rec) throw new NotFoundException(`Info record ${id} not found`);
    return rec;
  }

  async update(tenantId: string, id: string, dto: UpdateInfoRecordDto): Promise<PurchasingInfoRecord> {
    const rec = await this.findOne(tenantId, id);
    Object.assign(rec, dto);
    return this.repo.save(rec);
  }

  async remove(tenantId: string, id: string): Promise<{ deleted: boolean }> {
    const rec = await this.findOne(tenantId, id);
    await this.repo.remove(rec);
    return { deleted: true };
  }

  /** Find an active, date-valid info record for a vendor/item pair. */
  async findRecord(
    tenantId: string,
    vendorId: string,
    itemId: string,
  ): Promise<PurchasingInfoRecord | null> {
    const records = await this.repo.find({
      where: { tenantId, vendorId, itemId, isActive: true },
      order: { createdAt: 'DESC' },
    });
    const today = new Date().toISOString().slice(0, 10);
    const valid = records.find((r) => {
      if (r.validFrom && r.validFrom > today) return false;
      if (r.validTo && r.validTo < today) return false;
      return true;
    });
    return valid ?? null;
  }
}
