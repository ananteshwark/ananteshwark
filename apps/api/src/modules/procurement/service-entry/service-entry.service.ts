import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ServiceEntrySheet,
  ServiceEntryStatus,
} from './entities/service-entry-sheet.entity';
import { CreateServiceEntryDto } from './dto/service-entry.dto';
import { PoService } from '../po/po.service';
import { GrirService } from '../../finance/grir/grir.service';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class ServiceEntryService {
  constructor(
    @InjectRepository(ServiceEntrySheet)
    private readonly repo: Repository<ServiceEntrySheet>,
    private readonly poService: PoService,
    private readonly grirService: GrirService,
  ) {}

  private async nextNumber(tenantId: string): Promise<string> {
    const row = await this.repo
      .createQueryBuilder('e')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(e.sheet_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('e.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `SES-${String(next).padStart(6, '0')}`;
  }

  async create(tenantId: string, dto: CreateServiceEntryDto): Promise<ServiceEntrySheet> {
    // Validate the PO exists
    await this.poService.findOne(tenantId, dto.poId);
    const amount = round2(dto.quantity * dto.rate);
    const sheetNumber = await this.nextNumber(tenantId);
    const entity = this.repo.create({
      tenantId,
      sheetNumber,
      poId: dto.poId,
      poLineId: dto.poLineId ?? null,
      periodFrom: dto.periodFrom,
      periodTo: dto.periodTo,
      description: dto.description,
      quantity: dto.quantity,
      uom: dto.uom || 'EA',
      rate: dto.rate,
      amount,
      status: ServiceEntryStatus.DRAFT,
    });
    return this.repo.save(entity);
  }

  async findAll(
    tenantId: string,
    filters: { poId?: string; status?: ServiceEntryStatus },
  ): Promise<ServiceEntrySheet[]> {
    const where: any = { tenantId };
    if (filters.poId) where.poId = filters.poId;
    if (filters.status) where.status = filters.status;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(tenantId: string, id: string): Promise<ServiceEntrySheet> {
    const sheet = await this.repo.findOne({ where: { id, tenantId } });
    if (!sheet) throw new NotFoundException(`Service entry sheet ${id} not found`);
    return sheet;
  }

  async submit(tenantId: string, id: string): Promise<ServiceEntrySheet> {
    const sheet = await this.findOne(tenantId, id);
    if (sheet.status !== ServiceEntryStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT service entry sheets can be submitted');
    }
    sheet.status = ServiceEntryStatus.SUBMITTED;
    return this.repo.save(sheet);
  }

  async approve(tenantId: string, id: string, userId: string): Promise<ServiceEntrySheet> {
    const sheet = await this.findOne(tenantId, id);
    if (sheet.status !== ServiceEntryStatus.SUBMITTED) {
      throw new BadRequestException('Only SUBMITTED service entry sheets can be approved');
    }
    sheet.status = ServiceEntryStatus.APPROVED;
    sheet.approvedBy = userId;
    sheet.approvedAt = new Date();
    const saved = await this.repo.save(sheet);

    // On approval, create a GR-equivalent entry to feed the 3-way match.
    try {
      await this.grirService.createGrEntry(tenantId, {
        poId: sheet.poId,
        poLineId: sheet.poLineId,
        itemId: null,
        itemDescription: sheet.description,
        quantity: sheet.quantity,
        unitCost: sheet.rate,
        totalAmount: sheet.amount,
        postingDate: sheet.periodTo,
      });
    } catch (e: any) {
      console.warn(`GR/IR entry creation failed for service entry ${sheet.id}:`, e.message);
    }

    return saved;
  }

  async reject(tenantId: string, id: string, reason?: string): Promise<ServiceEntrySheet> {
    const sheet = await this.findOne(tenantId, id);
    if (sheet.status !== ServiceEntryStatus.SUBMITTED) {
      throw new BadRequestException('Only SUBMITTED service entry sheets can be rejected');
    }
    sheet.status = ServiceEntryStatus.REJECTED;
    sheet.rejectionReason = reason ?? null;
    return this.repo.save(sheet);
  }
}
