import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReturnsCreditService } from './returns-credit.service';
import { ReturnOrderStatus } from './entities/return-order.entity';
import { CreditNoteStatus } from './entities/credit-note.entity';
import { InvoiceStatus } from '../finance/ar/entities/invoice.entity';

/**
 * Customer returns & credit notes: return totals, receive putting goods back
 * to stock, credit notes inheriting the return amount, apply reducing the AR
 * invoice balance (capped, flipping PAID/PARTIAL), and double-apply guard.
 */
describe('ReturnsCreditService', () => {
  let service: ReturnsCreditService;
  let returnRepo: any, returnLineRepo: any, creditNoteRepo: any, invoiceRepo: any, inventoryService: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'gen-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ mx: 0 }),
      getMany: jest.fn().mockResolvedValue([]),
    })),
  });

  beforeEach(() => {
    returnRepo = mockRepo(); returnLineRepo = mockRepo(); creditNoteRepo = mockRepo(); invoiceRepo = mockRepo();
    inventoryService = { receiveStock: jest.fn().mockResolvedValue({}) };
    service = new ReturnsCreditService(returnRepo, returnLineRepo, creditNoteRepo, invoiceRepo, inventoryService);
  });

  it('createReturn requires lines and totals them', async () => {
    await expect(service.createReturn('t1', { lines: [] } as any)).rejects.toThrow('at least one line');

    const ro = await service.createReturn('t1', {
      customerId: 'c1',
      lines: [{ itemDescription: 'Widget', quantity: 2, unitPrice: 49.995 }],
    } as any);
    expect(ro.returnNumber).toBe('RET-0001');
    expect(ro.totalAmount).toBe(99.99);
    expect(ro.status).toBe(ReturnOrderStatus.DRAFT);
  });

  it('receiveReturn is DRAFT-only and restocks each stockable line', async () => {
    returnRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: ReturnOrderStatus.RECEIVED });
    await expect(service.receiveReturn('t1', 'r1')).rejects.toThrow(BadRequestException);

    const ro: any = { id: 'r1', tenantId: 't1', status: ReturnOrderStatus.DRAFT, returnDate: '2026-07-01', returnNumber: 'RET-0001' };
    returnRepo.findOne.mockResolvedValue(ro);
    returnLineRepo.find.mockResolvedValue([
      { itemId: 'i1', warehouseId: 'wh1', quantity: 2, unitPrice: 50 },
      { itemId: null, warehouseId: 'wh1', quantity: 1, unitPrice: 10 }, // non-stock: skipped
    ]);
    await service.receiveReturn('t1', 'r1');
    expect(inventoryService.receiveStock).toHaveBeenCalledTimes(1);
    expect(inventoryService.receiveStock).toHaveBeenCalledWith(
      't1', 'i1', 'wh1', 2, 50, 'RETURN_ORDER', 'r1', '2026-07-01', expect.any(String));
    expect(ro.status).toBe(ReturnOrderStatus.RECEIVED);
  });

  it('a credit note from a return inherits its amount/customer and credits the return', async () => {
    const ro: any = {
      id: 'r1', tenantId: 't1', status: ReturnOrderStatus.RECEIVED,
      totalAmount: 250, customerId: 'c1', customerName: 'Acme', invoiceId: 'inv1',
    };
    returnRepo.findOne.mockResolvedValue(ro);
    const cn = await service.createCreditNote('t1', { returnOrderId: 'r1' } as any);
    expect(cn.amount).toBe(250);
    expect(cn.customerId).toBe('c1');
    expect(cn.invoiceId).toBe('inv1');
    expect(cn.status).toBe(CreditNoteStatus.DRAFT);
    expect(ro.status).toBe(ReturnOrderStatus.CREDITED);
  });

  it('a standalone credit note requires customer + amount', async () => {
    await expect(service.createCreditNote('t1', {} as any)).rejects.toThrow('requires a return order');
    const cn = await service.createCreditNote('t1', { customerId: 'c1', amount: 100 } as any);
    expect(cn.amount).toBe(100);
  });

  it('applyCreditNote reduces the invoice balance (capped) and flips PAID/PARTIAL', async () => {
    creditNoteRepo.findOne.mockResolvedValue({ id: 'cn1', tenantId: 't1', status: CreditNoteStatus.ISSUED, amount: 150 });
    const invoice: any = { id: 'inv1', tenantId: 't1', balanceDue: 100, amountPaid: 50, status: InvoiceStatus.PARTIAL };
    invoiceRepo.findOne.mockResolvedValue(invoice);
    const cn = await service.applyCreditNote('t1', 'cn1', 'inv1');
    expect(cn.status).toBe(CreditNoteStatus.APPLIED);
    // credit capped at the 100 balance, not the 150 note amount
    expect(invoice.balanceDue).toBe(0);
    expect(invoice.amountPaid).toBe(150);
    expect(invoice.status).toBe(InvoiceStatus.PAID);
  });

  it('a partially covering credit leaves the invoice PARTIAL', async () => {
    creditNoteRepo.findOne.mockResolvedValue({ id: 'cn1', tenantId: 't1', status: CreditNoteStatus.ISSUED, amount: 40 });
    const invoice: any = { id: 'inv1', tenantId: 't1', balanceDue: 100, amountPaid: 0, status: InvoiceStatus.SENT };
    invoiceRepo.findOne.mockResolvedValue(invoice);
    await service.applyCreditNote('t1', 'cn1', 'inv1');
    expect(invoice.balanceDue).toBe(60);
    expect(invoice.status).toBe(InvoiceStatus.PARTIAL);
  });

  it('an already-applied credit note cannot be applied again', async () => {
    creditNoteRepo.findOne.mockResolvedValue({ id: 'cn1', tenantId: 't1', status: CreditNoteStatus.APPLIED });
    await expect(service.applyCreditNote('t1', 'cn1', 'inv1')).rejects.toThrow('already applied');
  });

  it('issueCreditNote is DRAFT-only; cancel blocked once CREDITED', async () => {
    creditNoteRepo.findOne.mockResolvedValue({ id: 'cn1', tenantId: 't1', status: CreditNoteStatus.ISSUED });
    await expect(service.issueCreditNote('t1', 'cn1')).rejects.toThrow(BadRequestException);

    returnRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: ReturnOrderStatus.CREDITED });
    await expect(service.cancelReturn('t1', 'r1')).rejects.toThrow(BadRequestException);

    returnRepo.findOne.mockResolvedValue(null);
    await expect(service.getReturn('t2', 'ghost')).rejects.toThrow(NotFoundException);
  });
});
