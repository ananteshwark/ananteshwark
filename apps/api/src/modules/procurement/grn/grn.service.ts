import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Grn, GrnStatus } from './entities/grn.entity';
import { GrnLine } from './entities/grn-line.entity';
import { CreateGrnDto } from './dto/grn.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';
import { PoService } from '../po/po.service';
import { PoStatus } from '../po/entities/purchase-order.entity';
import { Bill, BillStatus } from '../../finance/ap/entities/bill.entity';
import { BillLine } from '../../finance/ap/entities/bill-line.entity';
import { Vendor } from '../../finance/ap/entities/vendor.entity';
import { Account } from '../../finance/gl/entities/account.entity';
import { GlService } from '../../finance/gl/gl.service';
import { JournalSource } from '../../finance/gl/entities/journal-entry.entity';
import { DEFAULT_ACCOUNT_CODES } from '../../finance/finance.constants';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class GrnService {
  constructor(
    @InjectRepository(Grn) private readonly grnRepo: Repository<Grn>,
    @InjectRepository(GrnLine) private readonly lineRepo: Repository<GrnLine>,
    @InjectRepository(Bill) private readonly billRepo: Repository<Bill>,
    @InjectRepository(BillLine) private readonly billLineRepo: Repository<BillLine>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    private readonly poService: PoService,
    private readonly glService: GlService,
    private readonly dataSource: DataSource,
  ) {}

  private async nextNumber(tenantId: string): Promise<string> {
    const row = await this.grnRepo
      .createQueryBuilder('e')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(e.grn_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('e.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `GRN-${String(next).padStart(6, '0')}`;
  }

  async createGrn(tenantId: string, dto: CreateGrnDto): Promise<any> {
    const po = await this.poService.findOne(tenantId, dto.poId);
    if (!po) throw new NotFoundException(`PO ${dto.poId} not found`);
    if (![PoStatus.APPROVED, PoStatus.RELEASED, PoStatus.SENT, PoStatus.PARTIALLY_RECEIVED].includes(po.status)) {
      throw new BadRequestException('GRN can only be created against APPROVED, RELEASED, SENT, or PARTIALLY_RECEIVED POs');
    }

    const poLines = po.lines as any[];

    // Validate quantities
    for (const grnLine of dto.lines) {
      const poLine = poLines.find((l: any) => l.id === grnLine.poLineId);
      if (!poLine) throw new NotFoundException(`PO line ${grnLine.poLineId} not found`);
      const alreadyReceived = poLine.quantityReceived || 0;
      const remaining = round2(poLine.quantity - alreadyReceived);
      if (grnLine.quantityReceived > remaining + 0.0001) {
        throw new BadRequestException(
          `GRN quantity ${grnLine.quantityReceived} exceeds remaining quantity ${remaining} for line ${poLine.lineNumber}`,
        );
      }
    }

    const grnNumber = await this.nextNumber(tenantId);
    const grn = this.grnRepo.create({
      tenantId,
      grnNumber,
      poId: dto.poId,
      vendorId: po.vendorId,
      receiptDate: dto.receiptDate,
      notes: dto.notes || null,
      status: GrnStatus.DRAFT,
    });
    const saved = await this.grnRepo.save(grn);

    const lineEntities = dto.lines.map((l, idx) => {
      const poLine = poLines.find((pl: any) => pl.id === l.poLineId);
      return this.lineRepo.create({
        tenantId,
        grnId: saved.id,
        poLineId: l.poLineId,
        lineNumber: idx + 1,
        quantityOrdered: poLine.quantity,
        quantityReceived: l.quantityReceived,
        quantityAccepted: l.quantityAccepted,
        quantityRejected: l.quantityRejected || 0,
        rejectionReason: l.rejectionReason || null,
      });
    });
    await this.lineRepo.save(lineEntities);

    return this.findOne(tenantId, saved.id);
  }

  async confirmGrn(tenantId: string, id: string, userId: string): Promise<any> {
    return this.dataSource.transaction(async (manager) => {
      const grn = await manager.findOne(Grn, { where: { id, tenantId } });
      if (!grn) throw new NotFoundException(`GRN ${id} not found`);
      if (grn.status !== GrnStatus.DRAFT) throw new BadRequestException('Only DRAFT GRNs can be confirmed');

      const grnLines = await manager.find(GrnLine, { where: { grnId: id, tenantId } });

      // Update PO line quantity received
      for (const grnLine of grnLines) {
        await this.poService.updateLineQuantityReceived(tenantId, grnLine.poLineId, grnLine.quantityAccepted);
      }

      // Update PO status
      const po = await this.poService.findOne(tenantId, grn.poId);
      const allPoLines = po.lines as any[];
      const allFullyReceived = allPoLines.every(
        (l: any) => round2(l.quantityReceived + (grnLines.find((g) => g.poLineId === l.id)?.quantityAccepted || 0)) >= l.quantity - 0.0001,
      );
      const newPoStatus = allFullyReceived ? PoStatus.RECEIVED : PoStatus.PARTIALLY_RECEIVED;
      await this.poService.updatePoStatus(tenantId, grn.poId, newPoStatus);

      grn.status = GrnStatus.CONFIRMED;
      await manager.save(grn);

      // Trigger 3-way match and create AP bill
      try {
        await this.threeWayMatchInternal(tenantId, id, userId, grn, grnLines, po, manager);
      } catch (e) {
        console.warn('3-way match or bill creation failed:', e.message);
      }

      return this.findOne(tenantId, id);
    });
  }

  private async threeWayMatchInternal(
    tenantId: string,
    grnId: string,
    userId: string,
    grn: Grn,
    grnLines: GrnLine[],
    po: any,
    manager: any,
  ): Promise<void> {
    const poLines = po.lines as any[];

    let allMatched = true;
    for (const grnLine of grnLines) {
      const poLine = poLines.find((l: any) => l.id === grnLine.poLineId);
      if (!poLine) { allMatched = false; break; }
      const qtyMatch = grnLine.quantityAccepted >= poLine.quantity - 0.0001;
      if (!qtyMatch) {
        allMatched = false;
      }
    }

    if (!allMatched) return; // Only create bill when fully matched

    // Resolve AP control account
    const vendor = await manager.findOne(Vendor, { where: { id: grn.vendorId, tenantId } });
    let apAccountId: string;
    if (vendor?.apAccountId) {
      apAccountId = vendor.apAccountId;
    } else {
      const apAccount = await this.accountRepo.findOne({
        where: { tenantId, code: DEFAULT_ACCOUNT_CODES.AP_CONTROL },
      });
      if (!apAccount) return; // Can't create bill without AP account
      apAccountId = apAccount.id;
    }

    // Find an expense account for lines
    const expenseAccount = await this.accountRepo.findOne({
      where: { tenantId, code: DEFAULT_ACCOUNT_CODES.COGS },
    });
    if (!expenseAccount) return;

    // Build bill lines from PO lines
    const billLineData = poLines.map((poLine: any) => ({
      description: poLine.description,
      accountId: poLine.accountId || expenseAccount.id,
      quantity: poLine.quantity,
      unitPrice: poLine.unitPrice,
      taxRate: poLine.taxRate || 0,
    }));

    let subtotal = 0;
    let taxAmount = 0;
    const computedLines = billLineData.map((l) => {
      const net = round2(l.quantity * l.unitPrice);
      const tax = round2(net * (l.taxRate / 100));
      subtotal = round2(subtotal + net);
      taxAmount = round2(taxAmount + tax);
      return { ...l, taxAmount: tax, lineTotal: round2(net + tax) };
    });
    const total = round2(subtotal + taxAmount);

    const billNumber = `BILL-${grn.grnNumber}`;
    const bill = manager.create(Bill, {
      tenantId,
      billNumber,
      vendorId: grn.vendorId,
      billDate: grn.receiptDate,
      dueDate: grn.receiptDate,
      status: BillStatus.DRAFT,
      subtotal,
      taxAmount,
      total,
      amountPaid: 0,
      balanceDue: total,
      currency: po.currency || 'INR',
      reference: `GRN ${grn.grnNumber} / PO ${po.poNumber}`,
    });
    const savedBill = await manager.save(bill);

    const billLineEntities = computedLines.map((l, idx) =>
      manager.create(BillLine, {
        tenantId,
        billId: savedBill.id,
        lineNumber: idx + 1,
        description: l.description,
        accountId: l.accountId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
        taxAmount: l.taxAmount,
        lineTotal: l.lineTotal,
      }),
    );
    await manager.save(billLineEntities);

    // Post the bill (create JE)
    const jeLines: any[] = computedLines.map((l) => ({
      accountId: l.accountId,
      description: l.description,
      debit: round2(l.quantity * l.unitPrice),
      credit: 0,
    }));
    if (taxAmount > 0) {
      const taxAccount = await this.accountRepo.findOne({ where: { tenantId, code: DEFAULT_ACCOUNT_CODES.TAX_PAYABLE } });
      if (taxAccount) {
        jeLines.push({ accountId: taxAccount.id, description: 'Input tax', debit: taxAmount, credit: 0 });
      }
    }
    jeLines.push({ accountId: apAccountId, description: `AP - ${vendor?.name || 'Vendor'} - ${billNumber}`, debit: 0, credit: total });

    const je = await this.glService.postJournalEntry(
      tenantId,
      {
        date: grn.receiptDate,
        description: `Vendor bill from GRN ${grn.grnNumber}`,
        reference: billNumber,
        source: JournalSource.AP,
        currency: po.currency || 'INR',
        lines: jeLines,
      },
      userId,
      manager,
    );

    savedBill.journalEntryId = je.id;
    savedBill.status = BillStatus.OPEN;
    await manager.save(savedBill);
  }

  async threeWayMatch(tenantId: string, grnId: string): Promise<any> {
    const grn = await this.grnRepo.findOne({ where: { id: grnId, tenantId } });
    if (!grn) throw new NotFoundException(`GRN ${grnId} not found`);
    const grnLines = await this.lineRepo.find({ where: { grnId, tenantId } });
    const po = await this.poService.findOne(tenantId, grn.poId);
    const poLines = po.lines as any[];

    const lineResults = grnLines.map((grnLine) => {
      const poLine = poLines.find((l: any) => l.id === grnLine.poLineId);
      if (!poLine) return { poLineId: grnLine.poLineId, matched: false, reason: 'PO line not found' };
      const qtyMatch = grnLine.quantityAccepted >= poLine.quantity - 0.0001;
      return {
        poLineId: grnLine.poLineId,
        description: poLine.description,
        poQty: poLine.quantity,
        grnQty: grnLine.quantityAccepted,
        poPrice: poLine.unitPrice,
        matched: qtyMatch,
        withinTolerance: true,
      };
    });

    return {
      grnId,
      poId: grn.poId,
      matched: lineResults.every((r) => r.matched),
      lines: lineResults,
    };
  }

  async cancelGrn(tenantId: string, id: string): Promise<any> {
    const grn = await this.grnRepo.findOne({ where: { id, tenantId } });
    if (!grn) throw new NotFoundException(`GRN ${id} not found`);
    if (grn.status !== GrnStatus.DRAFT) throw new BadRequestException('Only DRAFT GRNs can be cancelled');
    grn.status = GrnStatus.CANCELLED;
    await this.grnRepo.save(grn);
    return this.findOne(tenantId, id);
  }

  async findAll(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<Grn>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.grnRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findOne(tenantId: string, id: string): Promise<any> {
    const grn = await this.grnRepo.findOne({ where: { id, tenantId } });
    if (!grn) throw new NotFoundException(`GRN ${id} not found`);
    const lines = await this.lineRepo.find({ where: { grnId: id, tenantId }, order: { lineNumber: 'ASC' } });
    return { ...grn, lines };
  }
}
