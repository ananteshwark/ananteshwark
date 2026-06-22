import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrder, PoStatus } from './entities/purchase-order.entity';
import { PoLine } from './entities/po-line.entity';
import { ApprovalMatrix } from '../entities/approval-matrix.entity';
import { CreatePoDto, UpdatePoDto } from './dto/po.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';
import { DoaService } from '../doa/doa.service';
import { InfoRecordService } from '../info-record/info-record.service';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class PoService {
  constructor(
    @InjectRepository(PurchaseOrder) private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PoLine) private readonly lineRepo: Repository<PoLine>,
    @InjectRepository(ApprovalMatrix) private readonly matrixRepo: Repository<ApprovalMatrix>,
    private readonly doaService: DoaService,
    private readonly infoRecordService: InfoRecordService,
  ) {}

  /**
   * Phase 31: For lines with an itemId but no explicit price, auto-populate the
   * unit price from an active, date-valid purchasing info record (additive).
   */
  private async applyInfoRecordPricing(
    tenantId: string,
    vendorId: string,
    lines: any[],
  ): Promise<any[]> {
    return Promise.all(
      lines.map(async (l) => {
        if ((l.unitPrice === undefined || l.unitPrice === null || l.unitPrice === 0) && l.itemId) {
          const rec = await this.infoRecordService.findRecord(tenantId, vendorId, l.itemId);
          if (rec) return { ...l, unitPrice: rec.price };
        }
        return l;
      }),
    );
  }

  private async nextNumber(tenantId: string): Promise<string> {
    const row = await this.poRepo
      .createQueryBuilder('e')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(e.po_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('e.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `PO-${String(next).padStart(6, '0')}`;
  }

  private computeLines(lines: any[]): { lineData: any[]; subtotal: number; taxAmount: number; total: number } {
    let subtotal = 0;
    let taxAmount = 0;
    const lineData = lines.map((l) => {
      const net = round2(l.quantity * l.unitPrice);
      const tax = round2(net * ((l.taxRate || 0) / 100));
      subtotal = round2(subtotal + net);
      taxAmount = round2(taxAmount + tax);
      return {
        ...l,
        taxAmount: tax,
        lineTotal: round2(net + tax),
      };
    });
    return { lineData, subtotal, taxAmount, total: round2(subtotal + taxAmount) };
  }

  async createPo(tenantId: string, dto: CreatePoDto): Promise<any> {
    const poNumber = await this.nextNumber(tenantId);
    const pricedLines = await this.applyInfoRecordPricing(tenantId, dto.vendorId, dto.lines);
    const { lineData, subtotal, taxAmount, total } = this.computeLines(pricedLines);

    const po = this.poRepo.create({
      tenantId,
      poNumber,
      rfqId: dto.rfqId || null,
      requisitionId: dto.requisitionId || null,
      vendorId: dto.vendorId,
      vendorName: dto.vendorName,
      poDate: dto.poDate,
      deliveryDate: dto.deliveryDate || null,
      currency: dto.currency || 'INR',
      subtotal,
      taxAmount,
      total,
      notes: dto.notes || null,
      termsConditions: dto.termsConditions || null,
      status: PoStatus.DRAFT,
    });
    const saved = await this.poRepo.save(po);
    await this.saveLines(tenantId, saved.id, lineData);
    return this.findOne(tenantId, saved.id);
  }

  private async saveLines(tenantId: string, poId: string, lines: any[]): Promise<void> {
    const entities = lines.map((l, idx) =>
      this.lineRepo.create({
        tenantId,
        poId,
        lineNumber: idx + 1,
        itemCode: l.itemCode || null,
        description: l.description,
        uom: l.uom || 'EA',
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate || 0,
        taxAmount: l.taxAmount,
        lineTotal: l.lineTotal,
        accountId: l.accountId || null,
        requisitionLineId: l.requisitionLineId || null,
        isService: l.isService ?? false,
        serviceUom: l.serviceUom || null,
      }),
    );
    await this.lineRepo.save(entities);
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    filters: { status?: PoStatus; vendorId?: string },
  ): Promise<PaginatedResponseDto<PurchaseOrder>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.poRepo.createQueryBuilder('po').where('po.tenantId = :tenantId', { tenantId });
    if (filters.status) qb.andWhere('po.status = :status', { status: filters.status });
    if (filters.vendorId) qb.andWhere('po.vendorId = :vendorId', { vendorId: filters.vendorId });
    qb.orderBy('po.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findOne(tenantId: string, id: string): Promise<any> {
    const po = await this.poRepo.findOne({ where: { id, tenantId } });
    if (!po) throw new NotFoundException(`Purchase Order ${id} not found`);
    const lines = await this.lineRepo.find({ where: { poId: id, tenantId }, order: { lineNumber: 'ASC' } });
    return { ...po, lines };
  }

  async updatePo(tenantId: string, id: string, dto: UpdatePoDto): Promise<any> {
    const po = await this.poRepo.findOne({ where: { id, tenantId } });
    if (!po) throw new NotFoundException(`Purchase Order ${id} not found`);
    if (po.status !== PoStatus.DRAFT) throw new BadRequestException('Only DRAFT POs can be updated');
    if (dto.deliveryDate !== undefined) po.deliveryDate = dto.deliveryDate;
    if (dto.notes !== undefined) po.notes = dto.notes;
    if (dto.termsConditions !== undefined) po.termsConditions = dto.termsConditions;
    if (dto.lines) {
      const { lineData, subtotal, taxAmount, total } = this.computeLines(dto.lines);
      po.subtotal = subtotal;
      po.taxAmount = taxAmount;
      po.total = total;
      await this.lineRepo.delete({ poId: id, tenantId });
      await this.saveLines(tenantId, id, lineData);
    }
    await this.poRepo.save(po);
    return this.findOne(tenantId, id);
  }

  async approvePo(tenantId: string, id: string, approverId: string): Promise<any> {
    const po = await this.poRepo.findOne({ where: { id, tenantId } });
    if (!po) throw new NotFoundException(`Purchase Order ${id} not found`);
    if (po.status !== PoStatus.DRAFT) throw new BadRequestException('Only DRAFT POs can be approved');
    po.status = PoStatus.APPROVED;
    po.approvedById = approverId;
    po.approvedAt = new Date();
    await this.poRepo.save(po);
    return this.findOne(tenantId, id);
  }

  async sendPo(tenantId: string, id: string): Promise<any> {
    const po = await this.poRepo.findOne({ where: { id, tenantId } });
    if (!po) throw new NotFoundException(`Purchase Order ${id} not found`);
    if (po.status !== PoStatus.APPROVED) throw new BadRequestException('Only APPROVED POs can be sent');
    po.status = PoStatus.SENT;
    await this.poRepo.save(po);
    return this.findOne(tenantId, id);
  }

  async cancelPo(tenantId: string, id: string): Promise<any> {
    const po = await this.poRepo.findOne({ where: { id, tenantId } });
    if (!po) throw new NotFoundException(`Purchase Order ${id} not found`);
    if ([PoStatus.RECEIVED, PoStatus.CLOSED, PoStatus.CANCELLED].includes(po.status)) {
      throw new BadRequestException('PO cannot be cancelled in its current status');
    }
    po.status = PoStatus.CANCELLED;
    await this.poRepo.save(po);
    return this.findOne(tenantId, id);
  }

  async updatePoStatus(tenantId: string, id: string, status: PoStatus): Promise<void> {
    await this.poRepo.update({ id, tenantId }, { status });
  }

  async getPoLines(tenantId: string, poId: string): Promise<PoLine[]> {
    return this.lineRepo.find({ where: { poId, tenantId }, order: { lineNumber: 'ASC' } });
  }

  async updateLineQuantityReceived(tenantId: string, lineId: string, additionalQty: number): Promise<void> {
    const line = await this.lineRepo.findOne({ where: { id: lineId, tenantId } });
    if (line) {
      line.quantityReceived = round2(line.quantityReceived + additionalQty);
      await this.lineRepo.save(line);
    }
  }

  // ─── Approval Matrix ──────────────────────────────────────────

  async listApprovalMatrices(tenantId: string): Promise<ApprovalMatrix[]> {
    return this.matrixRepo.find({ where: { tenantId, isActive: true }, order: { createdAt: 'ASC' } });
  }

  async createApprovalMatrix(tenantId: string, dto: Partial<ApprovalMatrix>): Promise<ApprovalMatrix> {
    const matrix = this.matrixRepo.create({ ...dto, tenantId });
    return this.matrixRepo.save(matrix);
  }

  async updateApprovalMatrix(tenantId: string, id: string, dto: Partial<ApprovalMatrix>): Promise<ApprovalMatrix> {
    const matrix = await this.matrixRepo.findOne({ where: { id, tenantId } });
    if (!matrix) throw new NotFoundException(`Approval matrix ${id} not found`);
    Object.assign(matrix, dto);
    return this.matrixRepo.save(matrix);
  }

  async getRequiredApprovalLevels(tenantId: string, poTotal: number): Promise<{ level: number; approverRole: string; label: string }[]> {
    const matrix = await this.matrixRepo.findOne({ where: { tenantId, isActive: true }, order: { createdAt: 'ASC' } });
    if (!matrix) return [];
    return matrix.levels.filter(l => {
      if (poTotal < l.minAmount) return false;
      if (l.maxAmount !== null && poTotal >= l.maxAmount) return false;
      return true;
    });
  }

  // ─── New workflow methods ─────────────────────────────────────

  async submitForApproval(tenantId: string, id: string): Promise<any> {
    const po = await this.poRepo.findOne({ where: { id, tenantId } });
    if (!po) throw new NotFoundException(`Purchase Order ${id} not found`);
    if (po.status !== PoStatus.DRAFT) throw new BadRequestException('Only DRAFT POs can be submitted for approval');

    const requiredApprovers = await this.doaService.getRequiredApprovers(tenantId, 'PO', po.total);
    if (requiredApprovers.length === 0) {
      // No approval required — auto-approve
      po.status = PoStatus.APPROVED;
      po.approvedAt = new Date();
    } else {
      po.status = PoStatus.PENDING_APPROVAL;
      po.currentApprovalLevel = 0;
    }
    await this.poRepo.save(po);
    return this.findOne(tenantId, id);
  }

  async approveByLevel(
    tenantId: string,
    id: string,
    userId: string,
    userName: string,
    comments?: string,
  ): Promise<any> {
    const po = await this.poRepo.findOne({ where: { id, tenantId } });
    if (!po) throw new NotFoundException(`Purchase Order ${id} not found`);
    if (po.status !== PoStatus.PENDING_APPROVAL) {
      throw new BadRequestException('PO is not pending approval');
    }

    const requiredApprovers = await this.doaService.getRequiredApprovers(tenantId, 'PO', po.total);
    const nextLevel = (po.currentApprovalLevel || 0) + 1;

    const historyEntry = {
      level: nextLevel,
      approverId: userId,
      approverName: userName,
      action: 'APPROVED',
      comments: comments || '',
      actionedAt: new Date().toISOString(),
    };

    po.approvalHistory = [...(po.approvalHistory || []), historyEntry];
    po.currentApprovalLevel = nextLevel;

    const maxLevel = requiredApprovers.reduce((max, r) => Math.max(max, r.level), 0);
    if (nextLevel >= maxLevel) {
      po.status = PoStatus.APPROVED;
      po.approvedById = userId;
      po.approvedAt = new Date();
    }

    await this.poRepo.save(po);
    return this.findOne(tenantId, id);
  }

  async rejectApproval(
    tenantId: string,
    id: string,
    userId: string,
    comments?: string,
  ): Promise<any> {
    const po = await this.poRepo.findOne({ where: { id, tenantId } });
    if (!po) throw new NotFoundException(`Purchase Order ${id} not found`);
    if (po.status !== PoStatus.PENDING_APPROVAL) {
      throw new BadRequestException('PO is not pending approval');
    }

    const historyEntry = {
      level: po.currentApprovalLevel || 0,
      approverId: userId,
      approverName: userId,
      action: 'REJECTED',
      comments: comments || '',
      actionedAt: new Date().toISOString(),
    };

    po.approvalHistory = [...(po.approvalHistory || []), historyEntry];
    po.status = PoStatus.DRAFT;
    po.currentApprovalLevel = 0;
    await this.poRepo.save(po);
    return this.findOne(tenantId, id);
  }

  async releasePo(tenantId: string, id: string, userId: string): Promise<any> {
    const po = await this.poRepo.findOne({ where: { id, tenantId } });
    if (!po) throw new NotFoundException(`Purchase Order ${id} not found`);
    if (po.status !== PoStatus.APPROVED) throw new BadRequestException('Only APPROVED POs can be released');
    po.status = PoStatus.RELEASED;
    po.releasedAt = new Date();
    po.releasedById = userId;
    await this.poRepo.save(po);
    return this.findOne(tenantId, id);
  }
}
