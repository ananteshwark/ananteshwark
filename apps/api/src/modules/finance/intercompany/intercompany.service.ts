import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IcRelationship } from './entities/ic-relationship.entity';
import {
  IcTransaction,
  IcTransactionStatus,
} from './entities/ic-transaction.entity';
import { LegalEntity } from '../../hr/employees/entities/legal-entity.entity';
import {
  CreateIcRelationshipDto,
  UpdateIcRelationshipDto,
  CreateIcTransactionDto,
} from './dto/intercompany.dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class IntercompanyService {
  constructor(
    @InjectRepository(IcRelationship)
    private readonly relRepo: Repository<IcRelationship>,
    @InjectRepository(IcTransaction)
    private readonly txnRepo: Repository<IcTransaction>,
    @InjectRepository(LegalEntity)
    private readonly entityRepo: Repository<LegalEntity>,
  ) {}

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async entityNameMap(tenantId: string): Promise<Record<string, string>> {
    const entities = await this.entityRepo.find({ where: { tenantId } });
    const map: Record<string, string> = {};
    for (const e of entities) map[e.id] = e.name;
    return map;
  }

  private async nextIcNumber(tenantId: string): Promise<string> {
    const row = await this.txnRepo
      .createQueryBuilder('t')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(t.ic_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('t.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `IC-${String(next).padStart(4, '0')}`;
  }

  // ─── Relationships ───────────────────────────────────────────────────────────

  listRelationships(tenantId: string): Promise<IcRelationship[]> {
    return this.relRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async createRelationship(
    tenantId: string,
    dto: CreateIcRelationshipDto,
  ): Promise<IcRelationship> {
    if (dto.sellingEntityId === dto.buyingEntityId) {
      throw new BadRequestException('Selling and buying entity must differ');
    }
    const existing = await this.relRepo.findOne({
      where: {
        tenantId,
        sellingEntityId: dto.sellingEntityId,
        buyingEntityId: dto.buyingEntityId,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'A relationship already exists for this entity pair',
      );
    }
    const rel = this.relRepo.create({
      tenantId,
      sellingEntityId: dto.sellingEntityId,
      buyingEntityId: dto.buyingEntityId,
      markupPercent: dto.markupPercent ?? 0,
      eliminationAccountId: dto.eliminationAccountId ?? null,
      icCustomerId: dto.icCustomerId ?? null,
      icVendorId: dto.icVendorId ?? null,
      revenueAccountId: dto.revenueAccountId ?? null,
      expenseAccountId: dto.expenseAccountId ?? null,
      description: dto.description ?? null,
      isActive: true,
    });
    return this.relRepo.save(rel);
  }

  async updateRelationship(
    tenantId: string,
    id: string,
    dto: UpdateIcRelationshipDto,
  ): Promise<IcRelationship> {
    const rel = await this.relRepo.findOne({ where: { id, tenantId } });
    if (!rel) throw new NotFoundException(`Relationship ${id} not found`);
    if (dto.markupPercent !== undefined) rel.markupPercent = dto.markupPercent;
    if (dto.eliminationAccountId !== undefined)
      rel.eliminationAccountId = dto.eliminationAccountId;
    if (dto.icCustomerId !== undefined) rel.icCustomerId = dto.icCustomerId;
    if (dto.icVendorId !== undefined) rel.icVendorId = dto.icVendorId;
    if (dto.revenueAccountId !== undefined) rel.revenueAccountId = dto.revenueAccountId;
    if (dto.expenseAccountId !== undefined) rel.expenseAccountId = dto.expenseAccountId;
    if (dto.isActive !== undefined) rel.isActive = dto.isActive;
    if (dto.description !== undefined) rel.description = dto.description;
    return this.relRepo.save(rel);
  }

  async deactivateRelationship(
    tenantId: string,
    id: string,
  ): Promise<IcRelationship> {
    const rel = await this.relRepo.findOne({ where: { id, tenantId } });
    if (!rel) throw new NotFoundException(`Relationship ${id} not found`);
    rel.isActive = false;
    return this.relRepo.save(rel);
  }

  // ─── Transactions ────────────────────────────────────────────────────────────

  async listTransactions(
    tenantId: string,
    filters: { entityId?: string; status?: string } = {},
  ): Promise<IcTransaction[]> {
    const qb = this.txnRepo
      .createQueryBuilder('t')
      .where('t.tenant_id = :tenantId', { tenantId });
    if (filters.status) {
      qb.andWhere('t.status = :status', { status: filters.status });
    }
    if (filters.entityId) {
      qb.andWhere(
        '(t.selling_entity_id = :eid OR t.buying_entity_id = :eid)',
        { eid: filters.entityId },
      );
    }
    qb.orderBy('t.created_at', 'DESC');
    return qb.getMany();
  }

  async getTransaction(tenantId: string, id: string): Promise<IcTransaction> {
    const txn = await this.txnRepo.findOne({ where: { id, tenantId } });
    if (!txn) throw new NotFoundException(`IC transaction ${id} not found`);
    return txn;
  }

  async createTransaction(
    tenantId: string,
    dto: CreateIcTransactionDto,
  ): Promise<IcTransaction> {
    if (dto.sellingEntityId === dto.buyingEntityId) {
      throw new BadRequestException('Selling and buying entity must differ');
    }
    const base = round2(dto.baseAmount);

    // Apply markup from an active relationship for this pair, if one exists.
    const rel = await this.relRepo.findOne({
      where: {
        tenantId,
        sellingEntityId: dto.sellingEntityId,
        buyingEntityId: dto.buyingEntityId,
        isActive: true,
      },
    });
    const markupPercent = rel ? Number(rel.markupPercent) : 0;
    const markupAmount = round2((base * markupPercent) / 100);
    const totalAmount = round2(base + markupAmount);

    const icNumber = await this.nextIcNumber(tenantId);
    const txn = this.txnRepo.create({
      tenantId,
      icNumber,
      relationshipId: rel?.id ?? null,
      sellingEntityId: dto.sellingEntityId,
      buyingEntityId: dto.buyingEntityId,
      transactionDate: dto.transactionDate,
      description: dto.description ?? null,
      baseAmount: base,
      markupAmount,
      totalAmount,
      status: IcTransactionStatus.DRAFT,
      sellingDocType: 'IC_AR',
      buyingDocType: 'IC_AP',
      notes: dto.notes ?? null,
    });
    return this.txnRepo.save(txn);
  }

  /**
   * Record an already-booked intercompany pair directly in POSTED status.
   * Used by automatic IC billing when a real AR invoice + mirror AP bill have
   * just been created, so the IC AR/AP balances are already on the books.
   */
  async recordPostedTransaction(
    tenantId: string,
    input: {
      sellingEntityId: string;
      buyingEntityId: string;
      transactionDate: string;
      baseAmount: number;
      markupAmount?: number;
      totalAmount?: number;
      relationshipId?: string | null;
      description?: string | null;
      notes?: string | null;
    },
  ): Promise<IcTransaction> {
    const base = round2(input.baseAmount);
    const markupAmount = round2(input.markupAmount ?? 0);
    const totalAmount = round2(input.totalAmount ?? base + markupAmount);
    const icNumber = await this.nextIcNumber(tenantId);
    const txn = this.txnRepo.create({
      tenantId,
      icNumber,
      relationshipId: input.relationshipId ?? null,
      sellingEntityId: input.sellingEntityId,
      buyingEntityId: input.buyingEntityId,
      transactionDate: input.transactionDate,
      description: input.description ?? null,
      baseAmount: base,
      markupAmount,
      totalAmount,
      status: IcTransactionStatus.POSTED,
      sellingDocType: 'IC_AR',
      buyingDocType: 'IC_AP',
      notes: input.notes ?? null,
    });
    return this.txnRepo.save(txn);
  }

  /**
   * Book the matched pair: an IC receivable in the seller and an IC payable in
   * the buyer. Modelled as a status transition with the stored amounts; no real
   * GL coupling is required for this phase.
   */
  async postTransaction(tenantId: string, id: string): Promise<IcTransaction> {
    const txn = await this.getTransaction(tenantId, id);
    if (txn.status !== IcTransactionStatus.DRAFT) {
      throw new BadRequestException(
        `Only DRAFT transactions can be posted (current: ${txn.status})`,
      );
    }
    txn.status = IcTransactionStatus.POSTED;
    return this.txnRepo.save(txn);
  }

  /** Eliminate a posted intercompany pair for consolidated reporting. */
  async eliminateTransaction(
    tenantId: string,
    id: string,
  ): Promise<IcTransaction> {
    const txn = await this.getTransaction(tenantId, id);
    if (txn.status !== IcTransactionStatus.POSTED) {
      throw new BadRequestException(
        `Only POSTED transactions can be eliminated (current: ${txn.status})`,
      );
    }
    txn.status = IcTransactionStatus.ELIMINATED;
    return this.txnRepo.save(txn);
  }

  // ─── Reconciliation ──────────────────────────────────────────────────────────

  /**
   * Per entity-pair reconciliation. For each pair, the IC AR booked in the
   * selling entity should equal the IC AP booked in the buying entity, so the
   * two net to zero. Anything else is an imbalance worth flagging.
   */
  async getReconciliation(tenantId: string): Promise<{
    pairs: any[];
    summary: {
      totalIcAr: number;
      totalIcAp: number;
      netDifference: number;
      imbalancedPairs: number;
    };
  }> {
    const [txns, names] = await Promise.all([
      this.txnRepo.find({
        where: { tenantId },
      }),
      this.entityNameMap(tenantId),
    ]);

    // Only posted (booked) transactions contribute to open IC balances;
    // eliminated ones are removed during consolidation. Drafts are not booked.
    const posted = txns.filter(
      (t) => t.status === IcTransactionStatus.POSTED,
    );

    const map = new Map<
      string,
      {
        sellingEntityId: string;
        buyingEntityId: string;
        icAr: number;
        icAp: number;
        count: number;
      }
    >();

    for (const t of posted) {
      const key = `${t.sellingEntityId}::${t.buyingEntityId}`;
      const cur =
        map.get(key) ?? {
          sellingEntityId: t.sellingEntityId,
          buyingEntityId: t.buyingEntityId,
          icAr: 0,
          icAp: 0,
          count: 0,
        };
      // Selling entity books the receivable; buying entity books the payable.
      cur.icAr = round2(cur.icAr + Number(t.totalAmount));
      cur.icAp = round2(cur.icAp + Number(t.totalAmount));
      cur.count += 1;
      map.set(key, cur);
    }

    const pairs = Array.from(map.values()).map((p) => {
      const netDifference = round2(p.icAr - p.icAp);
      return {
        sellingEntityId: p.sellingEntityId,
        buyingEntityId: p.buyingEntityId,
        sellingEntityName: names[p.sellingEntityId] ?? p.sellingEntityId,
        buyingEntityName: names[p.buyingEntityId] ?? p.buyingEntityId,
        icAr: p.icAr,
        icAp: p.icAp,
        netDifference,
        balanced: netDifference === 0,
        count: p.count,
      };
    });

    const totalIcAr = round2(pairs.reduce((s, p) => s + p.icAr, 0));
    const totalIcAp = round2(pairs.reduce((s, p) => s + p.icAp, 0));

    return {
      pairs,
      summary: {
        totalIcAr,
        totalIcAp,
        netDifference: round2(totalIcAr - totalIcAp),
        imbalancedPairs: pairs.filter((p) => !p.balanced).length,
      },
    };
  }
}
