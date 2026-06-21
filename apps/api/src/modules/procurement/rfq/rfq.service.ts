import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rfq, RfqStatus } from './entities/rfq.entity';
import { RfqLine } from './entities/rfq-line.entity';
import { RfqVendor } from './entities/rfq-vendor.entity';
import { RfqQuote } from './entities/rfq-quote.entity';
import { CreateRfqDto, RecordQuoteDto, AwardRfqDto } from './dto/rfq.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

@Injectable()
export class RfqService {
  constructor(
    @InjectRepository(Rfq) private readonly rfqRepo: Repository<Rfq>,
    @InjectRepository(RfqLine) private readonly lineRepo: Repository<RfqLine>,
    @InjectRepository(RfqVendor) private readonly vendorRepo: Repository<RfqVendor>,
    @InjectRepository(RfqQuote) private readonly quoteRepo: Repository<RfqQuote>,
  ) {}

  private async nextNumber(tenantId: string): Promise<string> {
    const row = await this.rfqRepo
      .createQueryBuilder('e')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(e.rfq_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('e.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `RFQ-${String(next).padStart(6, '0')}`;
  }

  async createRfq(tenantId: string, dto: CreateRfqDto): Promise<Rfq> {
    const rfqNumber = await this.nextNumber(tenantId);
    const rfq = this.rfqRepo.create({
      tenantId,
      rfqNumber,
      requisitionId: dto.requisitionId || null,
      title: dto.title,
      description: dto.description || null,
      issueDate: dto.issueDate,
      dueDate: dto.dueDate,
      notes: dto.notes || null,
      status: RfqStatus.DRAFT,
    });
    const saved = await this.rfqRepo.save(rfq);

    const lineEntities = dto.lines.map((l, idx) =>
      this.lineRepo.create({
        tenantId,
        rfqId: saved.id,
        lineNumber: idx + 1,
        itemCode: l.itemCode || null,
        description: l.description,
        uom: l.uom || 'EA',
        quantity: l.quantity,
        requisitionLineId: l.requisitionLineId || null,
      }),
    );
    await this.lineRepo.save(lineEntities);

    if (dto.vendorIds?.length) {
      const vendorEntities = dto.vendorIds.map((vid) =>
        this.vendorRepo.create({ tenantId, rfqId: saved.id, vendorId: vid }),
      );
      await this.vendorRepo.save(vendorEntities);
    }

    return this.findOne(tenantId, saved.id);
  }

  async findAll(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<Rfq>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.rfqRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findOne(tenantId: string, id: string): Promise<any> {
    const rfq = await this.rfqRepo.findOne({ where: { id, tenantId } });
    if (!rfq) throw new NotFoundException(`RFQ ${id} not found`);
    const lines = await this.lineRepo.find({ where: { rfqId: id, tenantId }, order: { lineNumber: 'ASC' } });
    const vendors = await this.vendorRepo.find({ where: { rfqId: id, tenantId } });
    const quotes = await this.quoteRepo.find({ where: { rfqId: id, tenantId } });
    return { ...rfq, lines, vendors, quotes };
  }

  async issueRfq(tenantId: string, id: string): Promise<any> {
    const rfq = await this.rfqRepo.findOne({ where: { id, tenantId } });
    if (!rfq) throw new NotFoundException(`RFQ ${id} not found`);
    if (rfq.status !== RfqStatus.DRAFT) throw new BadRequestException('Only DRAFT RFQs can be issued');
    rfq.status = RfqStatus.ISSUED;
    await this.rfqRepo.save(rfq);
    await this.vendorRepo.update({ rfqId: id, tenantId }, { invitedAt: new Date() });
    return this.findOne(tenantId, id);
  }

  async recordQuote(tenantId: string, rfqId: string, dto: RecordQuoteDto): Promise<RfqQuote> {
    const rfq = await this.rfqRepo.findOne({ where: { id: rfqId, tenantId } });
    if (!rfq) throw new NotFoundException(`RFQ ${rfqId} not found`);
    const line = await this.lineRepo.findOne({ where: { id: dto.lineId, rfqId, tenantId } });
    if (!line) throw new NotFoundException(`RFQ line ${dto.lineId} not found`);

    const totalPrice = Math.round(dto.unitPrice * line.quantity * 100) / 100;

    let quote = await this.quoteRepo.findOne({
      where: { rfqId, vendorId: dto.vendorId, lineId: dto.lineId, tenantId },
    });
    if (quote) {
      quote.unitPrice = dto.unitPrice;
      quote.totalPrice = totalPrice;
      quote.leadTimeDays = dto.leadTimeDays ?? null;
      quote.notes = dto.notes ?? null;
    } else {
      quote = this.quoteRepo.create({
        tenantId,
        rfqId,
        vendorId: dto.vendorId,
        lineId: dto.lineId,
        unitPrice: dto.unitPrice,
        totalPrice,
        leadTimeDays: dto.leadTimeDays ?? null,
        notes: dto.notes ?? null,
      });
    }
    const saved = await this.quoteRepo.save(quote);
    // Mark vendor as responded
    await this.vendorRepo.update(
      { rfqId, vendorId: dto.vendorId, tenantId },
      { responded: true, respondedAt: new Date() },
    );
    return saved;
  }

  async comparativeStatement(tenantId: string, rfqId: string): Promise<any> {
    const rfq = await this.rfqRepo.findOne({ where: { id: rfqId, tenantId } });
    if (!rfq) throw new NotFoundException(`RFQ ${rfqId} not found`);
    const lines = await this.lineRepo.find({ where: { rfqId, tenantId }, order: { lineNumber: 'ASC' } });
    const vendors = await this.vendorRepo.find({ where: { rfqId, tenantId } });
    const quotes = await this.quoteRepo.find({ where: { rfqId, tenantId } });

    const matrix = lines.map((line) => {
      const lineQuotes = vendors.map((v) => {
        const q = quotes.find((q) => q.lineId === line.id && q.vendorId === v.vendorId);
        return { vendorId: v.vendorId, unitPrice: q?.unitPrice ?? null, totalPrice: q?.totalPrice ?? null };
      });
      return { lineId: line.id, description: line.description, quantity: line.quantity, vendors: lineQuotes };
    });

    return { rfqId, lines: matrix, vendors: vendors.map((v) => v.vendorId) };
  }

  async awardRfq(tenantId: string, id: string, dto: AwardRfqDto): Promise<any> {
    const rfq = await this.rfqRepo.findOne({ where: { id, tenantId } });
    if (!rfq) throw new NotFoundException(`RFQ ${id} not found`);
    if (rfq.status !== RfqStatus.CLOSED) throw new BadRequestException('Only CLOSED RFQs can be awarded');
    const vendor = await this.vendorRepo.findOne({ where: { rfqId: id, vendorId: dto.vendorId, tenantId } });
    if (!vendor) throw new BadRequestException('Vendor is not part of this RFQ');
    rfq.awardedVendorId = dto.vendorId;
    rfq.awardedAt = new Date();
    await this.rfqRepo.save(rfq);
    return this.findOne(tenantId, id);
  }

  async closeRfq(tenantId: string, id: string): Promise<any> {
    const rfq = await this.rfqRepo.findOne({ where: { id, tenantId } });
    if (!rfq) throw new NotFoundException(`RFQ ${id} not found`);
    rfq.status = RfqStatus.CLOSED;
    await this.rfqRepo.save(rfq);
    return this.findOne(tenantId, id);
  }

  async cancelRfq(tenantId: string, id: string): Promise<any> {
    const rfq = await this.rfqRepo.findOne({ where: { id, tenantId } });
    if (!rfq) throw new NotFoundException(`RFQ ${id} not found`);
    if (rfq.status === RfqStatus.CLOSED) throw new BadRequestException('Closed RFQs cannot be cancelled');
    rfq.status = RfqStatus.CANCELLED;
    await this.rfqRepo.save(rfq);
    return this.findOne(tenantId, id);
  }
}
