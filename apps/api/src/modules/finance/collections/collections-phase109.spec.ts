import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { CollectionNote } from './entities/collection-note.entity';
import { PromiseToPay, PromiseStatus } from './entities/promise-to-pay.entity';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import { Invoice, InvoiceStatus } from '../ar/entities/invoice.entity';
import { Customer } from '../ar/entities/customer.entity';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn((x) => Promise.resolve({ id: 'gen-1', ...x })),
});

describe('CollectionsService — Phase 109-111', () => {
  let service: CollectionsService;
  let noteRepo: ReturnType<typeof mockRepo>;
  let promiseRepo: ReturnType<typeof mockRepo>;
  let disputeRepo: ReturnType<typeof mockRepo>;
  let invoiceRepo: ReturnType<typeof mockRepo>;
  let customerRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    noteRepo = mockRepo();
    promiseRepo = mockRepo();
    disputeRepo = mockRepo();
    invoiceRepo = mockRepo();
    customerRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        CollectionsService,
        { provide: getRepositoryToken(CollectionNote), useValue: noteRepo },
        { provide: getRepositoryToken(PromiseToPay), useValue: promiseRepo },
        { provide: getRepositoryToken(Dispute), useValue: disputeRepo },
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepo },
        { provide: getRepositoryToken(Customer), useValue: customerRepo },
      ],
    }).compile();
    service = module.get(CollectionsService);
  });

  // ─── Ph-109: Workbench ────────────────────────────────────────────

  it('getWorkbench — buckets outstanding by age and sorts by overdue', async () => {
    invoiceRepo.find.mockResolvedValue([
      { id: 'i1', customerId: 'c1', status: InvoiceStatus.SENT, balanceDue: 1000, dueDate: '2026-06-20' }, // 6 days overdue
      { id: 'i2', customerId: 'c1', status: InvoiceStatus.OVERDUE, balanceDue: 500, dueDate: '2026-03-01' }, // ~90+ overdue
      { id: 'i3', customerId: 'c2', status: InvoiceStatus.SENT, balanceDue: 200, dueDate: '2026-07-30' }, // future = current
    ]);
    customerRepo.find.mockResolvedValue([{ id: 'c1', name: 'Acme' }, { id: 'c2', name: 'Beta' }]);
    promiseRepo.find.mockResolvedValue([]);
    disputeRepo.find.mockResolvedValue([]);
    noteRepo.find.mockResolvedValue([]);

    const rows = await service.getWorkbench('t1', '2026-06-26');
    expect(rows).toHaveLength(2);
    const acme = rows.find((r) => r.customerId === 'c1');
    expect(acme.totalOutstanding).toBe(1500);
    expect(acme.b1_30).toBe(1000);
    expect(acme.b90plus).toBe(500);
    // c1 has higher overdue → sorted first
    expect(rows[0].customerId).toBe('c1');
  });

  it('getCustomerDetail — throws when customer missing', async () => {
    customerRepo.findOne.mockResolvedValue(null);
    await expect(service.getCustomerDetail('t1', 'nope')).rejects.toThrow(NotFoundException);
  });

  it('addNote — validates required fields', async () => {
    await expect(service.addNote('t1', { customerId: '', note: 'x' })).rejects.toThrow(BadRequestException);
    await expect(service.addNote('t1', { customerId: 'c1', note: '' })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-110: Promise-to-pay ───────────────────────────────────────

  it('createPromise — happy path', async () => {
    const p = await service.createPromise('t1', { customerId: 'c1', amountPromised: 5000, promiseDate: '2026-07-15' });
    expect(promiseRepo.create).toHaveBeenCalledWith(expect.objectContaining({ amountPromised: 5000, status: 'OPEN' }));
    expect(p.id).toBe('gen-1');
  });

  it('createPromise — rejects non-positive amount', async () => {
    await expect(service.createPromise('t1', { customerId: 'c1', amountPromised: 0, promiseDate: '2026-07-15' })).rejects.toThrow(BadRequestException);
  });

  it('resolvePromise — KEPT defaults amountKept to promised', async () => {
    promiseRepo.findOne.mockResolvedValue({ id: 'p1', status: PromiseStatus.OPEN, amountPromised: 5000 });
    promiseRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.resolvePromise('t1', 'p1', { status: PromiseStatus.KEPT });
    expect(r.status).toBe(PromiseStatus.KEPT);
    expect(r.amountKept).toBe(5000);
    expect(r.resolvedAt).toBeInstanceOf(Date);
  });

  it('resolvePromise — rejects already-resolved', async () => {
    promiseRepo.findOne.mockResolvedValue({ id: 'p1', status: PromiseStatus.KEPT });
    await expect(service.resolvePromise('t1', 'p1', { status: PromiseStatus.BROKEN })).rejects.toThrow(BadRequestException);
  });

  it('sweepBrokenPromises — marks overdue open promises broken', async () => {
    promiseRepo.find.mockResolvedValue([
      { id: 'p1', status: PromiseStatus.OPEN, promiseDate: '2026-06-01' }, // overdue
      { id: 'p2', status: PromiseStatus.OPEN, promiseDate: '2026-12-01' }, // future
    ]);
    promiseRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.sweepBrokenPromises('t1', '2026-06-26');
    expect(r.broken).toBe(1);
  });

  // ─── Ph-111: Disputes ─────────────────────────────────────────────

  it('raiseDispute — happy path, defaults customer from invoice', async () => {
    invoiceRepo.findOne.mockResolvedValue({ id: 'i1', customerId: 'c1' });
    const d = await service.raiseDispute('t1', { customerId: '', invoiceId: 'i1', disputedAmount: 300, description: 'wrong price' });
    expect(disputeRepo.create).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: 'i1', customerId: 'c1', status: 'OPEN' }));
    expect(d.id).toBe('gen-1');
  });

  it('raiseDispute — throws when invoice missing', async () => {
    invoiceRepo.findOne.mockResolvedValue(null);
    await expect(service.raiseDispute('t1', { customerId: 'c1', invoiceId: 'nope', disputedAmount: 1, description: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('updateDisputeStatus — RESOLVED sets resolvedAt', async () => {
    disputeRepo.findOne.mockResolvedValue({ id: 'd1', status: DisputeStatus.OPEN });
    disputeRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.updateDisputeStatus('t1', 'd1', { status: DisputeStatus.RESOLVED, resolutionNote: 'credited' });
    expect(r.status).toBe(DisputeStatus.RESOLVED);
    expect(r.resolvedAt).toBeInstanceOf(Date);
    expect(r.resolutionNote).toBe('credited');
  });

  it('getDisputedInvoiceIds — returns active dispute invoice ids', async () => {
    disputeRepo.find.mockResolvedValue([{ invoiceId: 'i1' }, { invoiceId: 'i2' }]);
    const set = await service.getDisputedInvoiceIds('t1');
    expect(set.has('i1')).toBe(true);
    expect(set.has('i2')).toBe(true);
    expect(set.has('i3')).toBe(false);
  });
});
