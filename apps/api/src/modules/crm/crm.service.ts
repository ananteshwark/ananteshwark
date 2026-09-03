import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CrmContact } from './entities/crm-contact.entity';
import { CrmOpportunity, OpportunityStage } from './entities/crm-opportunity.entity';
import { CrmActivity } from './entities/crm-activity.entity';
import { CrmQuote } from './entities/crm-quote.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';

@Injectable()
export class CrmService {
  constructor(
    @InjectRepository(CrmContact)
    private readonly contactRepo: Repository<CrmContact>,
    @InjectRepository(CrmOpportunity)
    private readonly opportunityRepo: Repository<CrmOpportunity>,
    @InjectRepository(CrmActivity)
    private readonly activityRepo: Repository<CrmActivity>,
    @InjectRepository(CrmQuote)
    private readonly quoteRepo: Repository<CrmQuote>,
  ) {}

  // ─── Contacts ─────────────────────────────────────────────────

  async createContact(tenantId: string, dto: Partial<CrmContact>): Promise<CrmContact> {
    const entity = this.contactRepo.create({ ...dto, tenantId });
    return this.contactRepo.save(entity);
  }

  async findContacts(
    tenantId: string,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedResponseDto<CrmContact>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.contactRepo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId });
    if (search) {
      qb.andWhere(
        '(c.firstName ILIKE :s OR c.lastName ILIKE :s OR c.email ILIKE :s OR c.company ILIKE :s)',
        { s: `%${search}%` },
      );
    }
    qb.orderBy('c.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findContact(tenantId: string, id: string): Promise<CrmContact> {
    const contact = await this.contactRepo.findOne({ where: { id, tenantId } });
    if (!contact) throw new NotFoundException(`Contact ${id} not found`);
    return contact;
  }

  async updateContact(tenantId: string, id: string, dto: Partial<CrmContact>): Promise<CrmContact> {
    const contact = await this.findContact(tenantId, id);
    Object.assign(contact, dto);
    return this.contactRepo.save(contact);
  }

  async deleteContact(tenantId: string, id: string): Promise<void> {
    const contact = await this.findContact(tenantId, id);
    await this.contactRepo.remove(contact);
  }

  // ─── Opportunities ────────────────────────────────────────────

  async createOpportunity(tenantId: string, dto: Partial<CrmOpportunity>): Promise<CrmOpportunity> {
    const entity = this.opportunityRepo.create({ ...dto, tenantId });
    return this.opportunityRepo.save(entity);
  }

  async findOpportunities(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { stage?: OpportunityStage; ownerId?: string },
  ): Promise<PaginatedResponseDto<CrmOpportunity>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.opportunityRepo
      .createQueryBuilder('o')
      .where('o.tenantId = :tenantId', { tenantId });
    if (filters?.stage) qb.andWhere('o.stage = :stage', { stage: filters.stage });
    if (filters?.ownerId) qb.andWhere('o.ownerId = :ownerId', { ownerId: filters.ownerId });
    qb.orderBy('o.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findOpportunity(tenantId: string, id: string): Promise<CrmOpportunity> {
    const opp = await this.opportunityRepo.findOne({ where: { id, tenantId } });
    if (!opp) throw new NotFoundException(`Opportunity ${id} not found`);
    return opp;
  }

  async updateOpportunity(tenantId: string, id: string, dto: Partial<CrmOpportunity>): Promise<CrmOpportunity> {
    const opp = await this.findOpportunity(tenantId, id);
    if (dto.stage === OpportunityStage.CLOSED_WON && !opp.wonAt) {
      (dto as any).wonAt = new Date();
    }
    Object.assign(opp, dto);
    return this.opportunityRepo.save(opp);
  }

  async deleteOpportunity(tenantId: string, id: string): Promise<void> {
    const opp = await this.findOpportunity(tenantId, id);
    await this.opportunityRepo.remove(opp);
  }

  // ─── Activities ───────────────────────────────────────────────

  async createActivity(tenantId: string, createdById: string, dto: Partial<CrmActivity>): Promise<CrmActivity> {
    const entity = this.activityRepo.create({ ...dto, tenantId, createdById });
    return this.activityRepo.save(entity);
  }

  async findActivities(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { contactId?: string; opportunityId?: string },
  ): Promise<PaginatedResponseDto<CrmActivity>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.activityRepo
      .createQueryBuilder('a')
      .where('a.tenantId = :tenantId', { tenantId });
    if (filters?.contactId) qb.andWhere('a.contactId = :contactId', { contactId: filters.contactId });
    if (filters?.opportunityId)
      qb.andWhere('a.opportunityId = :opportunityId', { opportunityId: filters.opportunityId });
    qb.orderBy('a.activityDate', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findActivity(tenantId: string, id: string): Promise<CrmActivity> {
    const activity = await this.activityRepo.findOne({ where: { id, tenantId } });
    if (!activity) throw new NotFoundException(`Activity ${id} not found`);
    return activity;
  }

  async updateActivity(tenantId: string, id: string, dto: Partial<CrmActivity>): Promise<CrmActivity> {
    const activity = await this.findActivity(tenantId, id);
    Object.assign(activity, dto);
    return this.activityRepo.save(activity);
  }

  async deleteActivity(tenantId: string, id: string): Promise<void> {
    const activity = await this.findActivity(tenantId, id);
    await this.activityRepo.remove(activity);
  }

  // ─── Quotes ───────────────────────────────────────────────────

  private async nextQuoteNumber(tenantId: string): Promise<string> {
    const row = await this.quoteRepo
      .createQueryBuilder('e')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(e.quote_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('e.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `QUOTE-${String(next).padStart(6, '0')}`;
  }

  async createQuote(tenantId: string, dto: Partial<CrmQuote>): Promise<CrmQuote> {
    const quoteNumber = await this.nextQuoteNumber(tenantId);
    const entity = this.quoteRepo.create({ ...dto, tenantId, quoteNumber });
    return this.quoteRepo.save(entity);
  }

  async findQuotes(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<CrmQuote>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.quoteRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findQuote(tenantId: string, id: string): Promise<CrmQuote> {
    const quote = await this.quoteRepo.findOne({ where: { id, tenantId } });
    if (!quote) throw new NotFoundException(`Quote ${id} not found`);
    return quote;
  }

  async updateQuote(tenantId: string, id: string, dto: Partial<CrmQuote>): Promise<CrmQuote> {
    const quote = await this.findQuote(tenantId, id);
    Object.assign(quote, dto);
    return this.quoteRepo.save(quote);
  }

  async deleteQuote(tenantId: string, id: string): Promise<void> {
    const quote = await this.findQuote(tenantId, id);
    await this.quoteRepo.remove(quote);
  }

  // ─── Analytics ────────────────────────────────────────────────

  async getSalesPipeline(tenantId: string): Promise<any[]> {
    const rows = await this.opportunityRepo
      .createQueryBuilder('o')
      .select('o.stage', 'stage')
      .addSelect('COUNT(o.id)', 'count')
      .addSelect('SUM(o.value)', 'totalValue')
      .where('o.tenantId = :tenantId', { tenantId })
      .andWhere('o.stage NOT IN (:...closed)', {
        closed: [OpportunityStage.CLOSED_LOST, OpportunityStage.CLOSED_WON],
      })
      .groupBy('o.stage')
      .getRawMany();
    return rows.map((r) => ({
      stage: r.stage,
      count: parseInt(r.count, 10),
      totalValue: parseFloat(r.totalValue) || 0,
    }));
  }

  async getConversionFunnel(tenantId: string, from: string, to: string): Promise<any> {
    const rows = await this.contactRepo
      .createQueryBuilder('c')
      .select('c.status', 'status')
      .addSelect('COUNT(c.id)', 'count')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere('c.createdAt >= :from', { from })
      .andWhere('c.createdAt <= :to', { to })
      .groupBy('c.status')
      .getRawMany();
    const result: Record<string, number> = {};
    for (const r of rows) {
      result[r.status.toLowerCase()] = parseInt(r.count, 10);
    }
    return result;
  }
}
