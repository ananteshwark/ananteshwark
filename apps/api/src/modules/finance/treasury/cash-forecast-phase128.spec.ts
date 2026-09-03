import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CashForecastService } from './cash-forecast.service';
import { CashForecast, CashForecastLine, ForecastBucket, ForecastCategory } from './entities/cash-forecast.entity';
import { FinancialInstrument, InstrumentStatus } from './entities/financial-instrument.entity';
import { Bill, BillStatus } from '../ap/entities/bill.entity';
import { Invoice, InvoiceStatus } from '../ar/entities/invoice.entity';
import { PayrollRun } from '../../payroll/runs/entities/payroll-run.entity';
import { BankTransaction } from '../bank/entities/bank-transaction.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
  createQueryBuilder: jest.fn(),
});

describe('CashForecastService — Phase 128-130', () => {
  let service: CashForecastService;
  let forecastRepo: any, lineRepo: any, billRepo: any, invoiceRepo: any, payrollRepo: any, instrumentRepo: any, bankTxnRepo: any;

  beforeEach(async () => {
    forecastRepo = mockRepo(); lineRepo = mockRepo(); billRepo = mockRepo();
    invoiceRepo = mockRepo(); payrollRepo = mockRepo(); instrumentRepo = mockRepo(); bankTxnRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        CashForecastService,
        { provide: getRepositoryToken(CashForecast), useValue: forecastRepo },
        { provide: getRepositoryToken(CashForecastLine), useValue: lineRepo },
        { provide: getRepositoryToken(Bill), useValue: billRepo },
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepo },
        { provide: getRepositoryToken(PayrollRun), useValue: payrollRepo },
        { provide: getRepositoryToken(FinancialInstrument), useValue: instrumentRepo },
        { provide: getRepositoryToken(BankTransaction), useValue: bankTxnRepo },
      ],
    }).compile();
    service = module.get(CashForecastService);
  });

  // ─── bucketing ────────────────────────────────────────────────────

  it('bucketKey — monthly maps to first of month', () => {
    expect(service.bucketKey('2026-06-17', ForecastBucket.MONTHLY)).toBe('2026-06-01');
  });
  it('bucketKey — weekly maps to Monday', () => {
    // 2026-06-17 is a Wednesday → Monday 2026-06-15
    expect(service.bucketKey('2026-06-17', ForecastBucket.WEEKLY)).toBe('2026-06-15');
  });
  it('bucketKey — daily is identity', () => {
    expect(service.bucketKey('2026-06-17', ForecastBucket.DAILY)).toBe('2026-06-17');
  });

  // ─── Ph-128: generation ───────────────────────────────────────────

  it('generateForecast — rejects bad date range', async () => {
    await expect(service.generateForecast('t1', { name: 'x', fromDate: '2026-07-01', toDate: '2026-06-01' })).rejects.toThrow(BadRequestException);
  });

  it('generateForecast — aggregates AR inflow, AP/payroll outflow, maturities', async () => {
    invoiceRepo.find.mockResolvedValue([
      { status: InvoiceStatus.SENT, balanceDue: 5000, dueDate: '2026-06-10' },
      { status: InvoiceStatus.DRAFT, balanceDue: 9999, dueDate: '2026-06-10' }, // excluded
    ]);
    billRepo.find.mockResolvedValue([{ status: BillStatus.OPEN, balanceDue: 2000, dueDate: '2026-06-12' }]);
    payrollRepo.find.mockResolvedValue([{ payDate: '2026-06-25', totalNet: 3000 }]);
    instrumentRepo.find.mockResolvedValue([{ status: InstrumentStatus.ACTIVE, maturityDate: '2026-06-20', faceValue: 10000, interestAccrued: 200 }]);
    forecastRepo.save.mockResolvedValue({ id: 'fc1' });

    const fc = await service.generateForecast('t1', { name: 'Q2', fromDate: '2026-06-01', toDate: '2026-06-30', bucket: ForecastBucket.MONTHLY });
    expect(forecastRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      forecastInflow: 15200, // 5000 AR + 10200 maturity
      forecastOutflow: 5000, // 2000 AP + 3000 payroll
    }));
    expect(fc.id).toBe('fc1');
    // 4 category lines persisted (AR, AP, PAYROLL, MATURITY) in the one monthly bucket
    expect(lineRepo.save).toHaveBeenCalledTimes(4);
  });

  it('generateForecast — excludes out-of-range and zero-balance docs', async () => {
    invoiceRepo.find.mockResolvedValue([
      { status: InvoiceStatus.SENT, balanceDue: 5000, dueDate: '2026-12-01' }, // out of range
      { status: InvoiceStatus.SENT, balanceDue: 0, dueDate: '2026-06-10' }, // zero
    ]);
    forecastRepo.save.mockResolvedValue({ id: 'fc1' });
    await service.generateForecast('t1', { name: 'x', fromDate: '2026-06-01', toDate: '2026-06-30' });
    expect(lineRepo.save).not.toHaveBeenCalled();
  });

  // ─── getForecast ──────────────────────────────────────────────────

  it('getForecast — rolls running balance across periods', async () => {
    forecastRepo.findOne.mockResolvedValue({ id: 'fc1', openingBalance: 1000, bucket: ForecastBucket.MONTHLY });
    lineRepo.find.mockResolvedValue([
      { periodKey: '2026-06-01', category: ForecastCategory.AR_RECEIPT, forecastAmount: 5000 },
      { periodKey: '2026-06-01', category: ForecastCategory.AP_PAYMENT, forecastAmount: -2000 },
      { periodKey: '2026-07-01', category: ForecastCategory.PAYROLL, forecastAmount: -1000 },
    ]);
    const res = await service.getForecast('t1', 'fc1');
    expect(res.periods).toHaveLength(2);
    expect(res.periods[0]).toMatchObject({ period: '2026-06-01', inflow: 5000, outflow: 2000, net: 3000, closingBalance: 4000 });
    expect(res.periods[1]).toMatchObject({ period: '2026-07-01', net: -1000, closingBalance: 3000 });
  });

  it('getForecast — throws when missing', async () => {
    forecastRepo.findOne.mockResolvedValue(null);
    await expect(service.getForecast('t1', 'nope')).rejects.toThrow(NotFoundException);
  });

  // ─── Ph-129: variance ─────────────────────────────────────────────

  it('varianceReport — compares forecast net vs actual bank movement', async () => {
    forecastRepo.findOne.mockResolvedValue({ id: 'fc1', fromDate: '2026-06-01', toDate: '2026-06-30', bucket: ForecastBucket.MONTHLY });
    lineRepo.find.mockResolvedValue([
      { periodKey: '2026-06-01', forecastAmount: 5000 },
      { periodKey: '2026-06-01', forecastAmount: -2000 },
    ]);
    bankTxnRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { date: '2026-06-15', amount: 4000 },
        { date: '2026-06-20', amount: -1000 },
      ]),
    });
    const res = await service.varianceReport('t1', 'fc1');
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ period: '2026-06-01', forecastNet: 3000, actualNet: 3000, variance: 0 });
    expect(res.totalVariance).toBe(0);
  });
});
