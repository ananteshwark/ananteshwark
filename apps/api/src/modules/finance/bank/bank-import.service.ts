import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { parseCamt053 } from './camt053.parser';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BankStatementImport,
  BankImportStatus,
} from './entities/bank-statement-import.entity';
import {
  ImportedBankLine,
  ImportedLineStatus,
  ImportedLineMatchType,
} from './entities/imported-bank-line.entity';
import { BankAccount } from './entities/bank-account.entity';
import { VendorPayment } from '../ap/entities/vendor-payment.entity';
import { CustomerReceipt } from '../ar/entities/customer-receipt.entity';

interface ImportRow {
  date: string;
  description?: string;
  reference?: string;
  amount: number | string;
}

const DATE_WINDOW_DAYS = 5;

@Injectable()
export class BankImportService {
  constructor(
    @InjectRepository(BankStatementImport)
    private readonly importRepo: Repository<BankStatementImport>,
    @InjectRepository(ImportedBankLine)
    private readonly lineRepo: Repository<ImportedBankLine>,
    @InjectRepository(BankAccount)
    private readonly bankAccountRepo: Repository<BankAccount>,
    @InjectRepository(VendorPayment)
    private readonly vendorPaymentRepo: Repository<VendorPayment>,
    @InjectRepository(CustomerReceipt)
    private readonly customerReceiptRepo: Repository<CustomerReceipt>,
  ) {}

  /** ISO 20022 camt.053 statement import — parses entries and reuses the
   *  CSV pipeline so dedupe and auto-matching behave identically. */
  async importCamt053(
    tenantId: string,
    bankAccountId: string,
    fileName: string,
    xml: string,
  ): Promise<{ import: BankStatementImport; transactionCount: number }> {
    let parsed;
    try {
      parsed = parseCamt053(xml);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
    if (!parsed.entries.length) throw new BadRequestException('Statement contains no bookable entries');
    return this.importCsv(
      tenantId,
      bankAccountId,
      fileName || `camt053-${parsed.statementId ?? 'statement'}.xml`,
      parsed.entries.map((e) => ({
        date: e.date,
        description: e.description ?? '',
        reference: e.reference ?? undefined,
        amount: e.amount,
      })),
    );
  }

  async importCsv(
    tenantId: string,
    bankAccountId: string,
    fileName: string,
    rows: ImportRow[],
  ): Promise<{ import: BankStatementImport; transactionCount: number }> {
    const account = await this.bankAccountRepo.findOne({
      where: { id: bankAccountId, tenantId },
    });
    if (!account) throw new NotFoundException(`Bank account ${bankAccountId} not found`);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('No rows to import');
    }

    const normalized = rows
      .map((r) => ({
        date: (r.date || '').trim(),
        description: (r.description || '').trim(),
        reference: r.reference ? String(r.reference).trim() : null,
        amount: Number(r.amount),
      }))
      .filter((r) => r.date && !Number.isNaN(r.amount));

    if (normalized.length === 0) {
      throw new BadRequestException('No valid rows to import (date and amount required)');
    }

    const dates = normalized.map((r) => r.date).sort();
    const fromDate = dates[0] || null;
    const toDate = dates[dates.length - 1] || null;

    const header = await this.importRepo.save(
      this.importRepo.create({
        tenantId,
        bankAccountId,
        fileName,
        importDate: new Date(),
        fromDate,
        toDate,
        transactionCount: normalized.length,
        matchedCount: 0,
        status: BankImportStatus.IMPORTED,
      }),
    );

    const lines = normalized.map((r) =>
      this.lineRepo.create({
        tenantId,
        importId: header.id,
        txnDate: r.date,
        description: r.description,
        reference: r.reference,
        amount: r.amount,
        matchedType: null,
        matchedId: null,
        status: ImportedLineStatus.UNMATCHED,
      }),
    );
    await this.lineRepo.save(lines);

    return { import: header, transactionCount: normalized.length };
  }

  async listImports(tenantId: string): Promise<BankStatementImport[]> {
    return this.importRepo.find({
      where: { tenantId },
      order: { importDate: 'DESC' },
    });
  }

  async getImportLines(
    tenantId: string,
    importId: string,
  ): Promise<{ import: BankStatementImport; lines: ImportedBankLine[] }> {
    const header = await this.importRepo.findOne({ where: { id: importId, tenantId } });
    if (!header) throw new NotFoundException(`Import ${importId} not found`);
    const lines = await this.lineRepo.find({
      where: { tenantId, importId },
      order: { txnDate: 'ASC' },
    });
    return { import: header, lines };
  }

  private daysBetween(a: string, b: string): number {
    return Math.abs(
      Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000),
    );
  }

  async autoMatch(
    tenantId: string,
    importId: string,
  ): Promise<{ matched: number; matchedCount: number }> {
    const header = await this.importRepo.findOne({ where: { id: importId, tenantId } });
    if (!header) throw new NotFoundException(`Import ${importId} not found`);

    const lines = await this.lineRepo.find({
      where: { tenantId, importId, status: ImportedLineStatus.UNMATCHED },
    });
    if (lines.length === 0) {
      return { matched: 0, matchedCount: header.matchedCount };
    }

    // Outgoing money (negative bank line) corresponds to vendor payments.
    // Incoming money (positive bank line) corresponds to customer receipts.
    const vendorPayments = await this.vendorPaymentRepo.find({ where: { tenantId } });
    const customerReceipts = await this.customerReceiptRepo.find({ where: { tenantId } });

    let newlyMatched = 0;

    for (const line of lines) {
      const abs = Math.abs(Number(line.amount));
      const lineRef = (line.reference || '').trim().toLowerCase();

      const matchCandidate = <T extends { id: string; amount: number; reference?: string }>(
        candidates: T[],
        dateOf: (c: T) => string,
      ): T | null => {
        // Prefer reference match, then amount + near date.
        if (lineRef) {
          const byRef = candidates.find(
            (c) =>
              (c.reference || '').trim().toLowerCase() === lineRef &&
              Math.abs(Number(c.amount) - abs) < 0.005,
          );
          if (byRef) return byRef;
        }
        const byAmountDate = candidates.find(
          (c) =>
            Math.abs(Number(c.amount) - abs) < 0.005 &&
            this.daysBetween(dateOf(c), line.txnDate) <= DATE_WINDOW_DAYS,
        );
        return byAmountDate || null;
      };

      let matchedType: string | null = null;
      let matchedId: string | null = null;

      if (Number(line.amount) < 0) {
        const vp = matchCandidate(vendorPayments as any, (c: any) => c.paymentDate);
        if (vp) {
          matchedType = ImportedLineMatchType.VENDOR_PAYMENT;
          matchedId = vp.id;
        }
      } else {
        const cr = matchCandidate(customerReceipts as any, (c: any) => c.receiptDate);
        if (cr) {
          matchedType = ImportedLineMatchType.CUSTOMER_RECEIPT;
          matchedId = cr.id;
        }
      }

      if (matchedId) {
        line.matchedType = matchedType;
        line.matchedId = matchedId;
        line.status = ImportedLineStatus.MATCHED;
        await this.lineRepo.save(line);
        newlyMatched++;
      }
    }

    if (newlyMatched > 0) {
      header.matchedCount = header.matchedCount + newlyMatched;
      await this.importRepo.save(header);
    }

    return { matched: newlyMatched, matchedCount: header.matchedCount };
  }

  async manualMatch(
    tenantId: string,
    lineId: string,
    type: string,
    id: string,
  ): Promise<ImportedBankLine> {
    const line = await this.lineRepo.findOne({ where: { id: lineId, tenantId } });
    if (!line) throw new NotFoundException(`Imported line ${lineId} not found`);

    if (
      type !== ImportedLineMatchType.VENDOR_PAYMENT &&
      type !== ImportedLineMatchType.CUSTOMER_RECEIPT
    ) {
      throw new BadRequestException('Invalid match type');
    }
    if (!id) throw new BadRequestException('A target id is required');

    const wasMatched = line.status === ImportedLineStatus.MATCHED;
    line.matchedType = type;
    line.matchedId = id;
    line.status = ImportedLineStatus.MATCHED;
    await this.lineRepo.save(line);

    if (!wasMatched) {
      const header = await this.importRepo.findOne({
        where: { id: line.importId, tenantId },
      });
      if (header) {
        header.matchedCount = header.matchedCount + 1;
        await this.importRepo.save(header);
      }
    }

    return line;
  }
}
