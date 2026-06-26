import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { LockboxService } from './lockbox.service';
import { LockboxBatch } from './entities/lockbox-batch.entity';
import { LockboxReceipt, LockboxReceiptStatus } from './entities/lockbox-receipt.entity';
import { Invoice, InvoiceStatus } from '../ar/entities/invoice.entity';
import { Customer } from '../ar/entities/customer.entity';
import { ArService } from '../ar/ar.service';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn((x) => Promise.resolve({ id: 'gen-1', ...x })),
});

describe('LockboxService — Phase 112-114', () => {
  let service: LockboxService;
  let batchRepo: ReturnType<typeof mockRepo>;
  let receiptRepo: ReturnType<typeof mockRepo>;
  let invoiceRepo: ReturnType<typeof mockRepo>;
  let customerRepo: ReturnType<typeof mockRepo>;
  let arService: { createCustomerReceipt: jest.Mock };

  beforeEach(async () => {
    batchRepo = mockRepo();
    receiptRepo = mockRepo();
    invoiceRepo = mockRepo();
    customerRepo = mockRepo();
    arService = { createCustomerReceipt: jest.fn().mockResolvedValue({ id: 'rcpt-1' }) };

    const module = await Test.createTestingModule({
      providers: [
        LockboxService,
        { provide: getRepositoryToken(LockboxBatch), useValue: batchRepo },
        { provide: getRepositoryToken(LockboxReceipt), useValue: receiptRepo },
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepo },
        { provide: getRepositoryToken(Customer), useValue: customerRepo },
        { provide: ArService, useValue: arService },
      ],
    }).compile();
    service = module.get(LockboxService);
  });

  // ─── Ph-112: parsers ──────────────────────────────────────────────

  it('parseNormalized — pipe-delimited lines', () => {
    const raw = 'ACME|1500.00|2026-06-01|Inv payment\n# comment\nBETA|200.50|2026-06-02|';
    const lines = service.parseNormalized(raw);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ customerRef: 'ACME', amount: 1500, receiptDate: '2026-06-01', memo: 'Inv payment' });
    expect(lines[1].memo).toBeNull();
  });

  it('parseMt940 — extracts credit transactions and refs', () => {
    const raw = [
      ':20:STMT001',
      ':61:2606010601C1500,00NTRFNONREF',
      ':86:REF:ACME payment for invoices',
      ':61:2606020602D300,00NTRF', // debit — ignored
      ':86:Bank charge',
    ].join('\n');
    const lines = service.parseMt940(raw);
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(1500);
    expect(lines[0].receiptDate).toBe('2026-06-01');
    expect(lines[0].customerRef).toBe('ACME');
  });

  it('parseBai2 — type-16 credit detail records', () => {
    const raw = '16,165,150000,,ACME,Invoice payment\n16,451,5000,,XYZ,debit memo';
    const lines = service.parseBai2(raw, '2026-06-01');
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(1500);
    expect(lines[0].customerRef).toBe('ACME');
  });

  // ─── importBatch ──────────────────────────────────────────────────

  it('importBatch — creates batch + receipts, resolves customer by code', async () => {
    customerRepo.findOne.mockImplementation(({ where }: any) =>
      where.code === 'ACME' ? Promise.resolve({ id: 'c1', code: 'ACME' }) : Promise.resolve(null),
    );
    batchRepo.count.mockResolvedValue(0);
    batchRepo.save.mockResolvedValue({ id: 'b1' });

    const batch = await service.importBatch('t1', {
      format: 'NORMALIZED' as any,
      content: 'ACME|1500.00|2026-06-01|pay\nUNKNOWN|50.00|2026-06-02|x',
    });
    expect(batch.id).toBe('b1');
    // 2 receipts saved
    const savedReceipts = receiptRepo.save.mock.calls.map((c) => c[0]);
    expect(savedReceipts).toHaveLength(2);
    expect(savedReceipts[0].status).toBe(LockboxReceiptStatus.UNAPPLIED); // matched
    expect(savedReceipts[1].status).toBe(LockboxReceiptStatus.UNMATCHED); // unresolved
  });

  it('importBatch — throws when nothing parses', async () => {
    await expect(service.importBatch('t1', { format: 'NORMALIZED' as any, content: '\n# only comments' })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-113: allocation strategies ────────────────────────────────

  const inv = (id: string, balanceDue: number, dueDate: string, invoiceNumber = id) =>
    ({ id, balanceDue, dueDate, invoiceNumber, status: InvoiceStatus.SENT } as Invoice);

  it('computeAllocations — OLDEST_FIRST greedily fills by due date', () => {
    const receipt = { amount: 1200 } as LockboxReceipt;
    const invoices = [inv('i2', 1000, '2026-05-01'), inv('i1', 500, '2026-03-01'), inv('i3', 800, '2026-07-01')];
    const allocs = service.computeAllocations(receipt, invoices, 'OLDEST_FIRST');
    expect(allocs).toEqual([
      { invoiceId: 'i1', amount: 500 },
      { invoiceId: 'i2', amount: 700 },
    ]);
  });

  it('computeAllocations — EXACT_MATCH matches a single balance', () => {
    const receipt = { amount: 800 } as LockboxReceipt;
    const invoices = [inv('i1', 500, '2026-03-01'), inv('i2', 800, '2026-05-01')];
    const allocs = service.computeAllocations(receipt, invoices, 'EXACT_MATCH');
    expect(allocs).toEqual([{ invoiceId: 'i2', amount: 800 }]);
  });

  it('computeAllocations — EXACT_MATCH returns nothing when no exact balance', () => {
    const receipt = { amount: 777 } as LockboxReceipt;
    const invoices = [inv('i1', 500, '2026-03-01')];
    expect(service.computeAllocations(receipt, invoices, 'EXACT_MATCH')).toEqual([]);
  });

  it('computeAllocations — BY_REFERENCE matches invoice number', () => {
    const receipt = { amount: 1000, customerRef: 'INV-042' } as LockboxReceipt;
    const invoices = [inv('i1', 500, '2026-03-01', 'INV-041'), inv('i2', 1200, '2026-05-01', 'INV-042')];
    const allocs = service.computeAllocations(receipt, invoices, 'BY_REFERENCE');
    expect(allocs).toEqual([{ invoiceId: 'i2', amount: 1000 }]); // min(1000, 1200)
  });

  // ─── applyBatch ───────────────────────────────────────────────────

  it('applyBatch — applies unapplied receipts and updates batch status', async () => {
    batchRepo.findOne.mockResolvedValue({ id: 'b1', appliedAmount: 0, totalAmount: 1000, status: 'PARSED' });
    receiptRepo.find.mockResolvedValue([
      { id: 'r1', customerId: 'c1', amount: 1000, status: LockboxReceiptStatus.UNAPPLIED },
    ]);
    invoiceRepo.find.mockResolvedValue([inv('i1', 1000, '2026-03-01')]);
    receiptRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    batchRepo.save.mockImplementation((x: any) => Promise.resolve(x));

    const result = await service.applyBatch('t1', 'b1', 'OLDEST_FIRST', 'u1');
    expect(result.applied).toBe(1);
    expect(result.appliedAmount).toBe(1000);
    expect(arService.createCustomerReceipt).toHaveBeenCalled();
  });

  it('applyBatch — skips receipt with no customer', async () => {
    batchRepo.findOne.mockResolvedValue({ id: 'b1', appliedAmount: 0, totalAmount: 500, status: 'PARSED' });
    receiptRepo.find.mockResolvedValue([{ id: 'r1', customerId: null, amount: 500, status: LockboxReceiptStatus.UNAPPLIED }]);
    batchRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const result = await service.applyBatch('t1', 'b1', 'OLDEST_FIRST', 'u1');
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
  });

  // ─── Ph-114: queue / manual ───────────────────────────────────────

  it('assignCustomer — UNMATCHED becomes UNAPPLIED', async () => {
    receiptRepo.findOne.mockResolvedValue({ id: 'r1', status: LockboxReceiptStatus.UNMATCHED });
    customerRepo.findOne.mockResolvedValue({ id: 'c1' });
    receiptRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.assignCustomer('t1', 'r1', 'c1');
    expect(r.customerId).toBe('c1');
    expect(r.status).toBe(LockboxReceiptStatus.UNAPPLIED);
  });

  it('manualApply — throws when no customer', async () => {
    receiptRepo.findOne.mockResolvedValue({ id: 'r1', status: LockboxReceiptStatus.UNAPPLIED, customerId: null });
    await expect(service.manualApply('t1', 'r1', 'OLDEST_FIRST', 'u1')).rejects.toThrow(BadRequestException);
  });

  it('manualApply — throws when receipt not found', async () => {
    receiptRepo.findOne.mockResolvedValue(null);
    await expect(service.manualApply('t1', 'nope', 'OLDEST_FIRST', 'u1')).rejects.toThrow(NotFoundException);
  });
});
