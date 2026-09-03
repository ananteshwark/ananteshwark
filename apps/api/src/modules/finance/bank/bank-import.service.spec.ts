import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BankImportService } from './bank-import.service';
import { ImportedLineStatus, ImportedLineMatchType } from './entities/imported-bank-line.entity';

/**
 * Bank statement import: CSV normalization (invalid rows dropped, date
 * range derived), auto-match preferring reference then amount+date-window,
 * direction routing (negative → vendor payments, positive → customer
 * receipts), and manual match counting.
 */
describe('BankImportService', () => {
  let service: BankImportService;
  let importRepo: any, lineRepo: any, bankAccountRepo: any, vendorPaymentRepo: any, customerReceiptRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'gen-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  });

  beforeEach(() => {
    importRepo = mockRepo(); lineRepo = mockRepo(); bankAccountRepo = mockRepo();
    vendorPaymentRepo = mockRepo(); customerReceiptRepo = mockRepo();
    bankAccountRepo.findOne.mockResolvedValue({ id: 'ba1', tenantId: 't1' });
    service = new BankImportService(importRepo, lineRepo, bankAccountRepo, vendorPaymentRepo, customerReceiptRepo);
  });

  it('importCsv drops invalid rows, derives the date range, and creates UNMATCHED lines', async () => {
    const { transactionCount } = await service.importCsv('t1', 'ba1', 'stmt.csv', [
      { date: '2026-07-03', description: 'fee', amount: -10 },
      { date: '2026-07-01', description: 'receipt', amount: 500 },
      { date: '', amount: 99 },                 // no date → dropped
      { date: '2026-07-02', amount: 'oops' },   // NaN → dropped
    ]);
    expect(transactionCount).toBe(2);
    expect(importRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      fromDate: '2026-07-01', toDate: '2026-07-03', transactionCount: 2,
    }));
    expect(lineRepo.create).toHaveBeenCalledWith(expect.objectContaining({ status: ImportedLineStatus.UNMATCHED }));
  });

  it('importCsv rejects empty or fully-invalid inputs', async () => {
    await expect(service.importCsv('t1', 'ba1', 'f', [])).rejects.toThrow('No rows');
    await expect(service.importCsv('t1', 'ba1', 'f', [{ date: '', amount: 'x' } as any])).rejects.toThrow('No valid rows');
  });

  it('autoMatch prefers an exact reference match over amount+date', async () => {
    importRepo.findOne.mockResolvedValue({ id: 'imp1', tenantId: 't1', matchedCount: 0 });
    lineRepo.find.mockResolvedValue([
      { id: 'l1', amount: -100, reference: 'CHQ-77', txnDate: '2026-07-01', status: ImportedLineStatus.UNMATCHED },
    ]);
    vendorPaymentRepo.find.mockResolvedValue([
      { id: 'vp-amount', amount: 100, reference: 'OTHER', paymentDate: '2026-07-01' },
      { id: 'vp-ref', amount: 100, reference: 'chq-77', paymentDate: '2026-06-01' }, // ref wins despite old date
    ]);
    const r = await service.autoMatch('t1', 'imp1');
    expect(r.matched).toBe(1);
    expect(lineRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      matchedId: 'vp-ref', matchedType: ImportedLineMatchType.VENDOR_PAYMENT, status: ImportedLineStatus.MATCHED,
    }));
  });

  it('autoMatch routes positive lines to receipts and respects the 5-day window', async () => {
    importRepo.findOne.mockResolvedValue({ id: 'imp1', tenantId: 't1', matchedCount: 0 });
    lineRepo.find.mockResolvedValue([
      { id: 'l1', amount: 500, reference: null, txnDate: '2026-07-10', status: ImportedLineStatus.UNMATCHED },
    ]);
    customerReceiptRepo.find.mockResolvedValue([
      { id: 'cr-far', amount: 500, receiptDate: '2026-06-01' },  // outside window
      { id: 'cr-near', amount: 500, receiptDate: '2026-07-08' }, // within 5 days
    ]);
    await service.autoMatch('t1', 'imp1');
    expect(lineRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      matchedId: 'cr-near', matchedType: ImportedLineMatchType.CUSTOMER_RECEIPT,
    }));
  });

  it('manualMatch validates type, increments matchedCount only on first match', async () => {
    lineRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', importId: 'imp1', status: ImportedLineStatus.UNMATCHED });
    await expect(service.manualMatch('t1', 'l1', 'BOGUS', 'x')).rejects.toThrow('Invalid match type');

    const header: any = { id: 'imp1', tenantId: 't1', matchedCount: 3 };
    importRepo.findOne.mockResolvedValue(header);
    await service.manualMatch('t1', 'l1', ImportedLineMatchType.VENDOR_PAYMENT, 'vp1');
    expect(header.matchedCount).toBe(4);

    // re-matching an already matched line does not double count
    lineRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', importId: 'imp1', status: ImportedLineStatus.MATCHED });
    await service.manualMatch('t1', 'l1', ImportedLineMatchType.CUSTOMER_RECEIPT, 'cr1');
    expect(header.matchedCount).toBe(4);
  });

  it('lookups are tenant-scoped 404s', async () => {
    bankAccountRepo.findOne.mockResolvedValue(null);
    await expect(service.importCsv('t2', 'ghost', 'f', [{ date: 'd', amount: 1 }])).rejects.toThrow(NotFoundException);
    importRepo.findOne.mockResolvedValue(null);
    await expect(service.autoMatch('t2', 'ghost')).rejects.toThrow(NotFoundException);
  });
});
