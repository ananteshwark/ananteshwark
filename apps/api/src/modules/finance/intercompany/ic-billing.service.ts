import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IcRelationship } from './entities/ic-relationship.entity';
import { IcTransaction, IcTransactionStatus } from './entities/ic-transaction.entity';
import { IntercompanyService } from './intercompany.service';
import { ArService } from '../ar/ar.service';
import { ApService } from '../ap/ap.service';
import { GlService } from '../gl/gl.service';
import { Account } from '../gl/entities/account.entity';
import { JournalSource } from '../gl/entities/journal-entry.entity';
import { ConsolidationGroup } from '../consolidation/entities/consolidation-group.entity';
import { DEFAULT_ACCOUNT_CODES } from '../finance.constants';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface MirrorBillResult {
  billId: string;
  billNumber: string;
  icTransactionId: string;
  icNumber: string;
  total: number;
}

export interface EliminationResult {
  eliminatedCount: number;
  journalEntryId: string | null;
  totalEliminated: number;
}

@Injectable()
export class IcBillingService {
  constructor(
    @InjectRepository(IcRelationship)
    private readonly relRepo: Repository<IcRelationship>,
    @InjectRepository(IcTransaction)
    private readonly txnRepo: Repository<IcTransaction>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(ConsolidationGroup)
    private readonly groupRepo: Repository<ConsolidationGroup>,
    private readonly intercompanyService: IntercompanyService,
    private readonly arService: ArService,
    private readonly apService: ApService,
    private readonly glService: GlService,
  ) {}

  private async resolveAccountByCode(tenantId: string, code: string): Promise<Account> {
    const account = await this.accountRepo.findOne({ where: { tenantId, code } });
    if (!account) {
      throw new BadRequestException(
        `Required account (code ${code}) is missing from the chart of accounts`,
      );
    }
    return account;
  }

  /**
   * Generate the mirror AP bill in the buying entity for an intercompany AR
   * invoice already raised in the selling entity, post it, and record the
   * matched IC transaction (POSTED).
   */
  async generateMirrorBill(
    tenantId: string,
    arInvoiceId: string,
    relationshipId: string,
    userId: string,
  ): Promise<MirrorBillResult> {
    const rel = await this.relRepo.findOne({ where: { id: relationshipId, tenantId } });
    if (!rel) throw new NotFoundException(`IC relationship ${relationshipId} not found`);
    if (!rel.icVendorId) {
      throw new BadRequestException(
        'Relationship has no icVendorId; set the vendor that represents the selling entity in the buying entity books',
      );
    }

    const invoice = await this.arService.findInvoice(tenantId, arInvoiceId);
    if (!invoice) throw new NotFoundException(`AR invoice ${arInvoiceId} not found`);

    // Guard against double-billing the same invoice.
    const existing = await this.txnRepo.findOne({
      where: { tenantId, description: `IC bill for invoice ${invoice.invoiceNumber}` },
    });
    if (existing) {
      throw new BadRequestException(
        `A mirror bill already exists for invoice ${invoice.invoiceNumber}`,
      );
    }

    const expenseAccount = rel.expenseAccountId
      ? await this.glService.findAccount(tenantId, rel.expenseAccountId)
      : await this.resolveAccountByCode(tenantId, DEFAULT_ACCOUNT_CODES.COGS);

    const billNumber = `IC-BILL-${invoice.invoiceNumber}`;
    const bill = await this.apService.createBill(tenantId, {
      billNumber,
      vendorId: rel.icVendorId,
      billDate: invoice.invoiceDate,
      currency: invoice.currency,
      reference: invoice.invoiceNumber,
      notes: `Intercompany mirror bill for AR invoice ${invoice.invoiceNumber}`,
      lines: invoice.lines.map((l: any) => ({
        accountId: expenseAccount.id,
        description: l.description ?? 'Intercompany purchase',
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        taxRate: Number(l.taxRate ?? 0),
      })),
    } as any);

    await this.apService.postBill(tenantId, bill.id, userId);

    const icTxn = await this.intercompanyService.recordPostedTransaction(tenantId, {
      sellingEntityId: rel.sellingEntityId,
      buyingEntityId: rel.buyingEntityId,
      transactionDate: invoice.invoiceDate,
      baseAmount: round2(Number(invoice.subtotal)),
      totalAmount: round2(Number(invoice.total)),
      relationshipId: rel.id,
      description: `IC bill for invoice ${invoice.invoiceNumber}`,
      notes: `AR invoice ${invoice.invoiceNumber} ↔ AP bill ${billNumber}`,
    });

    return {
      billId: bill.id,
      billNumber: bill.billNumber,
      icTransactionId: icTxn.id,
      icNumber: icTxn.icNumber,
      total: round2(Number(invoice.total)),
    };
  }

  /**
   * Generate a single elimination journal entry for all POSTED intercompany
   * transactions (optionally scoped to a consolidation group's member entities),
   * removing the intra-group revenue against the intra-group expense, then mark
   * those transactions ELIMINATED.
   */
  async generateEliminationEntries(
    tenantId: string,
    opts: { periodEnd: string; groupId?: string },
    userId: string,
  ): Promise<EliminationResult> {
    let memberSet: Set<string> | null = null;
    if (opts.groupId) {
      const group = await this.groupRepo.findOne({ where: { id: opts.groupId, tenantId } });
      if (!group) throw new NotFoundException(`Consolidation group ${opts.groupId} not found`);
      memberSet = new Set(group.memberEntityIds ?? []);
    }

    const posted = await this.txnRepo.find({
      where: { tenantId, status: IcTransactionStatus.POSTED },
    });
    const inScope = posted.filter(
      (t) =>
        t.transactionDate <= opts.periodEnd &&
        (!memberSet ||
          (memberSet.has(t.sellingEntityId) && memberSet.has(t.buyingEntityId))),
    );

    if (inScope.length === 0) {
      return { eliminatedCount: 0, journalEntryId: null, totalEliminated: 0 };
    }

    // Aggregate elimination lines by account: Dr revenue, Cr expense per relationship.
    const rels = await this.relRepo.find({ where: { tenantId } });
    const relMap = new Map(rels.map((r) => [r.id, r]));
    const revenueDefault = await this.resolveAccountByCode(tenantId, DEFAULT_ACCOUNT_CODES.SALES_REVENUE);
    const expenseDefault = await this.resolveAccountByCode(tenantId, DEFAULT_ACCOUNT_CODES.COGS);

    const debitByAccount = new Map<string, number>(); // revenue accounts (Dr to remove)
    const creditByAccount = new Map<string, number>(); // expense accounts (Cr to remove)
    let total = 0;

    for (const t of inScope) {
      const rel = t.relationshipId ? relMap.get(t.relationshipId) : undefined;
      const revAcct = rel?.revenueAccountId ?? revenueDefault.id;
      const expAcct = rel?.expenseAccountId ?? expenseDefault.id;
      const amt = round2(Number(t.totalAmount));
      debitByAccount.set(revAcct, round2((debitByAccount.get(revAcct) ?? 0) + amt));
      creditByAccount.set(expAcct, round2((creditByAccount.get(expAcct) ?? 0) + amt));
      total = round2(total + amt);
    }

    const lines: Array<{ accountId: string; debit: number; credit: number; description: string }> = [];
    for (const [accountId, debit] of debitByAccount.entries()) {
      lines.push({ accountId, debit, credit: 0, description: 'IC revenue elimination' });
    }
    for (const [accountId, credit] of creditByAccount.entries()) {
      lines.push({ accountId, debit: 0, credit, description: 'IC expense elimination' });
    }

    const je = await this.glService.postJournalEntry(
      tenantId,
      {
        date: opts.periodEnd,
        description: `Intercompany elimination (${inScope.length} transaction${inScope.length === 1 ? '' : 's'})`,
        reference: opts.groupId ? `IC-ELIM-${opts.groupId.slice(0, 8)}` : 'IC-ELIM',
        source: JournalSource.SYSTEM,
        currency: 'USD',
        lines,
      },
      userId,
    );

    for (const t of inScope) {
      t.status = IcTransactionStatus.ELIMINATED;
    }
    await this.txnRepo.save(inScope);

    return { eliminatedCount: inScope.length, journalEntryId: je.id, totalEliminated: total };
  }
}
