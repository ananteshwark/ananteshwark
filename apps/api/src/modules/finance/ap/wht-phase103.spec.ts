import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WhtService } from './wht.service';
import { SequenceService } from '../../../common/sequence/sequence.service';
import { ApWhtCode, WhtCertificateType } from './entities/ap-wht-code.entity';

const seqMock = () => ({
  next: jest.fn().mockResolvedValue(1),
  formatted: jest.fn((_t: string, _k: string, prefix: string, pad = 6) => Promise.resolve(`${prefix}${String(1).padStart(pad, '0')}`)),
});
import { WhtCertificate } from './entities/wht-certificate.entity';
import { Bill } from './entities/bill.entity';
import { Vendor } from './entities/vendor.entity';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn((x) => Promise.resolve({ id: 'gen-1', ...x })),
  remove: jest.fn(),
});

describe('WhtService — Phase 103-105', () => {
  let service: WhtService;
  let codeRepo: ReturnType<typeof mockRepo>;
  let certRepo: ReturnType<typeof mockRepo>;
  let billRepo: ReturnType<typeof mockRepo>;
  let vendorRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    codeRepo = mockRepo();
    certRepo = mockRepo();
    billRepo = mockRepo();
    vendorRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        WhtService,
        { provide: SequenceService, useValue: seqMock() },
        { provide: getRepositoryToken(ApWhtCode), useValue: codeRepo },
        { provide: getRepositoryToken(WhtCertificate), useValue: certRepo },
        { provide: getRepositoryToken(Bill), useValue: billRepo },
        { provide: getRepositoryToken(Vendor), useValue: vendorRepo },
      ],
    }).compile();
    service = module.get(WhtService);
  });

  // ─── Ph-103: codes ────────────────────────────────────────────────

  it('createCode — happy path', async () => {
    codeRepo.findOne.mockResolvedValue(null);
    const code = await service.createCode('t1', { code: '194J', name: 'Professional fees', rate: 10, thresholdAmount: 30000, section: '194J' });
    expect(codeRepo.create).toHaveBeenCalledWith(expect.objectContaining({ code: '194J', rate: 10 }));
    expect(code.id).toBe('gen-1');
  });

  it('createCode — rejects duplicate', async () => {
    codeRepo.findOne.mockResolvedValue({ id: 'x' });
    await expect(service.createCode('t1', { code: '194J', name: 'x', rate: 10 })).rejects.toThrow(BadRequestException);
  });

  it('createCode — rejects negative rate', async () => {
    await expect(service.createCode('t1', { code: 'X', name: 'x', rate: -1 })).rejects.toThrow(BadRequestException);
  });

  it('getCode — throws when missing', async () => {
    codeRepo.findOne.mockResolvedValue(null);
    await expect(service.getCode('t1', 'nope')).rejects.toThrow(NotFoundException);
  });

  // ─── Ph-104: compute engine ───────────────────────────────────────

  it('computeWht — applies rate above threshold', () => {
    const code = { isActive: true, rate: 10, thresholdAmount: 30000 } as ApWhtCode;
    const r = service.computeWht(100000, code);
    expect(r.applicable).toBe(true);
    expect(r.whtAmount).toBe(10000);
  });

  it('computeWht — no withholding below threshold', () => {
    const code = { isActive: true, rate: 10, thresholdAmount: 30000 } as ApWhtCode;
    const r = service.computeWht(20000, code);
    expect(r.applicable).toBe(false);
    expect(r.whtAmount).toBe(0);
    expect(r.reason).toContain('below threshold');
  });

  it('computeWht — inactive code → not applicable', () => {
    const code = { isActive: false, rate: 10, thresholdAmount: 0 } as ApWhtCode;
    const r = service.computeWht(100000, code);
    expect(r.applicable).toBe(false);
  });

  it('computeWht — rounds to 2 decimals', () => {
    const code = { isActive: true, rate: 7.5, thresholdAmount: 0 } as ApWhtCode;
    const r = service.computeWht(1234.57, code);
    expect(r.whtAmount).toBe(92.59); // 1234.57 * 0.075 = 92.59275
  });

  it('computeForBill — resolves code then computes', async () => {
    codeRepo.findOne.mockResolvedValue({ id: 'c1', isActive: true, rate: 10, thresholdAmount: 0 });
    const r = await service.computeForBill('t1', 'c1', 5000);
    expect(r.whtAmount).toBe(500);
    expect(r.code.id).toBe('c1');
  });

  // ─── Ph-105: certificates ─────────────────────────────────────────

  it('generateCertificate — aggregates WHT bills', async () => {
    vendorRepo.findOne.mockResolvedValue({ id: 'v1', name: 'Acme' });
    billRepo.find.mockResolvedValue([
      { billNumber: 'B1', billDate: '2026-04-10', subtotal: 100000, whtAmount: 10000, whtCodeId: 'c1' },
      { billNumber: 'B2', billDate: '2026-05-10', subtotal: 50000, whtAmount: 5000, whtCodeId: 'c1' },
      { billNumber: 'B3', billDate: '2026-05-12', subtotal: 20000, whtAmount: 0, whtCodeId: null },
    ]);
    codeRepo.findOne.mockResolvedValue({ id: 'c1', code: '194J', section: '194J', certificateType: WhtCertificateType.FORM_16A });
    certRepo.count.mockResolvedValue(0);

    const cert = await service.generateCertificate('t1', {
      vendorId: 'v1', fiscalYear: '2026-27', periodFrom: '2026-04-01', periodTo: '2026-06-30',
    });
    expect(certRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      grossAmount: 150000, whtAmount: 15000, billCount: 2, section: '194J', certificateNumber: 'WHT-000001',
    }));
    expect(cert.id).toBe('gen-1');
  });

  it('generateCertificate — throws when no WHT bills', async () => {
    vendorRepo.findOne.mockResolvedValue({ id: 'v1', name: 'Acme' });
    billRepo.find.mockResolvedValue([{ billNumber: 'B3', subtotal: 20000, whtAmount: 0 }]);
    await expect(
      service.generateCertificate('t1', { vendorId: 'v1', fiscalYear: '2026-27', periodFrom: '2026-04-01', periodTo: '2026-06-30' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('generateCertificate — throws when vendor missing', async () => {
    vendorRepo.findOne.mockResolvedValue(null);
    await expect(
      service.generateCertificate('t1', { vendorId: 'nope', fiscalYear: '2026-27', periodFrom: '2026-04-01', periodTo: '2026-06-30' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('listCertificates — filters by vendor', async () => {
    certRepo.find.mockResolvedValue([]);
    await service.listCertificates('t1', 'v1');
    expect(certRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 't1', vendorId: 'v1' } }));
  });
});
