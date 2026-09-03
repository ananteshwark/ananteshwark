import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseRequisition, RequisitionStatus } from './entities/purchase-requisition.entity';
import { RequisitionLine } from './entities/requisition-line.entity';
import { CreateRequisitionDto, UpdateRequisitionDto } from './dto/requisition.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';
import { AutomationService } from '../../automation/automation.service';

@Injectable()
export class RequisitionService {
  constructor(
    @InjectRepository(PurchaseRequisition)
    private readonly reqRepo: Repository<PurchaseRequisition>,
    @InjectRepository(RequisitionLine)
    private readonly lineRepo: Repository<RequisitionLine>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  private async nextNumber(tenantId: string): Promise<string> {
    const row = await this.reqRepo
      .createQueryBuilder('e')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(e.req_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('e.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `PR-${String(next).padStart(6, '0')}`;
  }

  private computeTotal(lines: { quantity: number; unitPrice?: number }[]): number {
    return lines.reduce((sum, l) => {
      const price = l.unitPrice ?? 0;
      return Math.round((sum + l.quantity * price + Number.EPSILON) * 100) / 100;
    }, 0);
  }

  async createRequisition(
    tenantId: string,
    userId: string,
    dto: CreateRequisitionDto,
  ): Promise<PurchaseRequisition> {
    const reqNumber = await this.nextNumber(tenantId);
    const totalAmount = this.computeTotal(dto.lines);
    const req = this.reqRepo.create({
      tenantId,
      reqNumber,
      requestedByUserId: userId,
      title: dto.title,
      description: dto.description || null,
      priority: dto.priority,
      requiredBy: dto.requiredBy || null,
      departmentId: dto.departmentId || null,
      notes: dto.notes || null,
      status: RequisitionStatus.DRAFT,
      totalAmount,
    });
    const saved = await this.reqRepo.save(req);
    await this.saveLines(tenantId, saved.id, dto.lines);
    return this.findOne(tenantId, saved.id);
  }

  private async saveLines(
    tenantId: string,
    requisitionId: string,
    lines: any[],
  ): Promise<void> {
    const entities = lines.map((l, idx) =>
      this.lineRepo.create({
        tenantId,
        requisitionId,
        lineNumber: idx + 1,
        itemCode: l.itemCode || null,
        description: l.description,
        uom: l.uom || 'EA',
        quantity: l.quantity,
        unitPrice: l.unitPrice ?? null,
        estimatedTotal: l.unitPrice ? Math.round(l.quantity * l.unitPrice * 100) / 100 : null,
        category: l.category || null,
        accountId: l.accountId || null,
      }),
    );
    await this.lineRepo.save(entities);
  }

  async findOne(tenantId: string, id: string): Promise<PurchaseRequisition & { lines: RequisitionLine[] }> {
    const req = await this.reqRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException(`Requisition ${id} not found`);
    const lines = await this.lineRepo.find({
      where: { requisitionId: id, tenantId },
      order: { lineNumber: 'ASC' },
    });
    return { ...req, lines } as any;
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    filters: { status?: RequisitionStatus; requestedByUserId?: string; departmentId?: string },
  ): Promise<PaginatedResponseDto<PurchaseRequisition>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.reqRepo
      .createQueryBuilder('r')
      .where('r.tenantId = :tenantId', { tenantId });
    if (filters.status) qb.andWhere('r.status = :status', { status: filters.status });
    if (filters.requestedByUserId)
      qb.andWhere('r.requestedByUserId = :uid', { uid: filters.requestedByUserId });
    if (filters.departmentId)
      qb.andWhere('r.departmentId = :deptId', { deptId: filters.departmentId });
    qb.orderBy('r.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async updateRequisition(
    tenantId: string,
    id: string,
    dto: UpdateRequisitionDto,
  ): Promise<PurchaseRequisition> {
    const req = await this.reqRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException(`Requisition ${id} not found`);
    if (req.status !== RequisitionStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT requisitions can be updated');
    }
    if (dto.title !== undefined) req.title = dto.title;
    if (dto.description !== undefined) req.description = dto.description;
    if (dto.priority !== undefined) req.priority = dto.priority;
    if (dto.requiredBy !== undefined) req.requiredBy = dto.requiredBy;
    if (dto.departmentId !== undefined) req.departmentId = dto.departmentId;
    if (dto.notes !== undefined) req.notes = dto.notes;
    if (dto.lines) {
      req.totalAmount = this.computeTotal(dto.lines);
      await this.lineRepo.delete({ requisitionId: id, tenantId });
      await this.saveLines(tenantId, id, dto.lines);
    }
    await this.reqRepo.save(req);
    return this.findOne(tenantId, id);
  }

  async submitRequisition(tenantId: string, id: string): Promise<PurchaseRequisition> {
    const req = await this.reqRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException(`Requisition ${id} not found`);
    if (req.status !== RequisitionStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT requisitions can be submitted');
    }
    req.status = RequisitionStatus.SUBMITTED;
    await this.reqRepo.save(req);
    return this.findOne(tenantId, id);
  }

  async approveRequisition(tenantId: string, id: string, approverId: string): Promise<PurchaseRequisition> {
    const req = await this.reqRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException(`Requisition ${id} not found`);
    if (req.status !== RequisitionStatus.SUBMITTED) {
      throw new BadRequestException('Only SUBMITTED requisitions can be approved');
    }
    req.status = RequisitionStatus.APPROVED;
    req.approvedById = approverId;
    req.approvedAt = new Date();
    await this.reqRepo.save(req);
    await this.automation?.emit(tenantId, 'requisition.approved', { requisitionId: req.id, reqNumber: req.reqNumber, totalAmount: Number(req.totalAmount), approvedById: approverId });
    return this.findOne(tenantId, id);
  }

  async rejectRequisition(tenantId: string, id: string, reason: string, approverId: string): Promise<PurchaseRequisition> {
    const req = await this.reqRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException(`Requisition ${id} not found`);
    if (req.status !== RequisitionStatus.SUBMITTED) {
      throw new BadRequestException('Only SUBMITTED requisitions can be rejected');
    }
    req.status = RequisitionStatus.REJECTED;
    req.rejectionReason = reason;
    req.approvedById = approverId;
    req.approvedAt = new Date();
    await this.reqRepo.save(req);
    return this.findOne(tenantId, id);
  }

  async cancelRequisition(tenantId: string, id: string): Promise<PurchaseRequisition> {
    const req = await this.reqRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException(`Requisition ${id} not found`);
    if ([RequisitionStatus.CONVERTED, RequisitionStatus.CANCELLED].includes(req.status)) {
      throw new BadRequestException('Requisition cannot be cancelled in its current status');
    }
    req.status = RequisitionStatus.CANCELLED;
    await this.reqRepo.save(req);
    return this.findOne(tenantId, id);
  }

  async markConverted(tenantId: string, id: string): Promise<void> {
    await this.reqRepo.update({ id, tenantId }, { status: RequisitionStatus.CONVERTED });
  }

  async getLines(tenantId: string, requisitionId: string): Promise<RequisitionLine[]> {
    return this.lineRepo.find({
      where: { requisitionId, tenantId },
      order: { lineNumber: 'ASC' },
    });
  }
}
