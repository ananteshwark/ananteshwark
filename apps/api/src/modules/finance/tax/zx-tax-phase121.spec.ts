import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ZxTaxService } from './zx-tax.service';
import { ZxRegime, ZxTax, ZxStatus, ZxRate } from './entities/zx-hierarchy.entity';
import { ZxRule, ZxRuleType } from './entities/zx-rule.entity';
import { ZxRegistration, ZxPartyType } from './entities/zx-registration.entity';
import { TaxLine, TaxDocumentType } from './entities/tax-line.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn((x) => Promise.resolve({ id: 'gen-1', ...x })),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('ZxTaxService — Phase 121-124', () => {
  let service: ZxTaxService;
  let regimeRepo: any, taxRepo: any, statusRepo: any, rateRepo: any, ruleRepo: any, regRepo: any, taxLineRepo: any;

  beforeEach(async () => {
    regimeRepo = mockRepo(); taxRepo = mockRepo(); statusRepo = mockRepo();
    rateRepo = mockRepo(); ruleRepo = mockRepo(); regRepo = mockRepo(); taxLineRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        ZxTaxService,
        { provide: getRepositoryToken(ZxRegime), useValue: regimeRepo },
        { provide: getRepositoryToken(ZxTax), useValue: taxRepo },
        { provide: getRepositoryToken(ZxStatus), useValue: statusRepo },
        { provide: getRepositoryToken(ZxRate), useValue: rateRepo },
        { provide: getRepositoryToken(ZxRule), useValue: ruleRepo },
        { provide: getRepositoryToken(ZxRegistration), useValue: regRepo },
        { provide: getRepositoryToken(TaxLine), useValue: taxLineRepo },
      ],
    }).compile();
    service = module.get(ZxTaxService);
  });

  // ─── Ph-121: hierarchy ────────────────────────────────────────────

  it('createRegime — rejects duplicate', async () => {
    regimeRepo.findOne.mockResolvedValue({ id: 'r1' });
    await expect(service.createRegime('t1', { code: 'IN_GST' })).rejects.toThrow(BadRequestException);
  });

  it('createRegime — happy path', async () => {
    regimeRepo.findOne.mockResolvedValue(null);
    const r: any = await service.createRegime('t1', { code: 'IN_GST', name: 'India GST', effectiveFrom: '2017-07-01' });
    expect(regimeRepo.create).toHaveBeenCalledWith(expect.objectContaining({ code: 'IN_GST', isActive: true }));
    expect(r.id).toBe('gen-1');
  });

  it('createTax — requires regimeId and code', async () => {
    await expect(service.createTax('t1', { code: 'CGST' } as any)).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-122: rules / conditions ───────────────────────────────────

  it('createRule — validates condition leaf', async () => {
    await expect(
      service.createRule('t1', { regimeId: 'r1', ruleType: ZxRuleType.STATUS, conditionExpression: { op: 'eq' } } as any),
    ).rejects.toThrow(BadRequestException);
  });

  describe('evaluateCondition', () => {
    it('isTrue / isFalse', () => {
      expect(service.evaluateCondition({ field: 'intraState', op: 'isTrue' }, { intraState: true })).toBe(true);
      expect(service.evaluateCondition({ field: 'intraState', op: 'isFalse' }, { intraState: false })).toBe(true);
    });
    it('and/or/not', () => {
      const expr = { and: [{ field: 'country', op: 'eq', value: 'IN' }, { field: 'amount', op: 'gt', value: 1000 }] };
      expect(service.evaluateCondition(expr, { country: 'IN', amount: 5000 })).toBe(true);
      expect(service.evaluateCondition(expr, { country: 'IN', amount: 500 })).toBe(false);
      expect(service.evaluateCondition({ not: { field: 'country', op: 'eq', value: 'IN' } }, { country: 'US' })).toBe(true);
    });
    it('in operator', () => {
      expect(service.evaluateCondition({ field: 'customerState', op: 'in', value: ['KA', 'MH'] }, { customerState: 'KA' })).toBe(true);
    });
  });

  // ─── Ph-123: registrations ────────────────────────────────────────

  it('isPartyRegistered — true within effective window', async () => {
    regRepo.find.mockResolvedValue([{ effectiveFrom: '2020-01-01', effectiveTo: null }]);
    expect(await service.isPartyRegistered('t1', ZxPartyType.VENDOR, 'v1', 'r1', '2026-06-01')).toBe(true);
  });

  it('isPartyRegistered — false when expired', async () => {
    regRepo.find.mockResolvedValue([{ effectiveFrom: '2020-01-01', effectiveTo: '2021-01-01' }]);
    expect(await service.isPartyRegistered('t1', ZxPartyType.VENDOR, 'v1', 'r1', '2026-06-01')).toBe(false);
  });

  // ─── Determination engine ─────────────────────────────────────────

  it('determineTax — throws when regime missing', async () => {
    regimeRepo.findOne.mockResolvedValue(null);
    await expect(service.determineTax('t1', 'NOPE', { date: '2026-06-01', amount: 1000 })).rejects.toThrow(NotFoundException);
  });

  it('determineTax — throws when regime not effective', async () => {
    regimeRepo.findOne.mockResolvedValue({ id: 'r1', code: 'IN_GST', effectiveFrom: '2030-01-01', effectiveTo: null });
    await expect(service.determineTax('t1', 'IN_GST', { date: '2026-06-01', amount: 1000 })).rejects.toThrow(BadRequestException);
  });

  it('determineTax — default status + default rate path', async () => {
    regimeRepo.findOne.mockResolvedValue({ id: 'r1', code: 'IN_GST', effectiveFrom: '2017-07-01', effectiveTo: null });
    taxRepo.find.mockResolvedValue([{ id: 'tax1', code: 'IGST', name: 'Integrated GST', isActive: true }]);
    ruleRepo.find.mockResolvedValue([]); // no rules → defaults
    statusRepo.find.mockResolvedValue([{ id: 's1', code: 'STANDARD', isDefault: true, taxId: 'tax1' }]);
    rateRepo.find.mockResolvedValue([{ id: 'rt1', code: 'GST18', rate: 18, isDefault: true, effectiveFrom: '2017-07-01', effectiveTo: null, glAccountId: 'gl1' }]);

    const result = await service.determineTax('t1', 'IN_GST', { date: '2026-06-01', amount: 1000 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ taxCode: 'IGST', statusCode: 'STANDARD', rate: 18, taxAmount: 180, baseAmount: 1000 });
  });

  it('determineTax — APPLICABILITY rule can exclude a tax', async () => {
    regimeRepo.findOne.mockResolvedValue({ id: 'r1', code: 'IN_GST', effectiveFrom: '2017-07-01', effectiveTo: null });
    taxRepo.find.mockResolvedValue([{ id: 'tax1', code: 'CGST', name: 'Central GST', isActive: true }]);
    ruleRepo.find.mockResolvedValue([
      { id: 'rule1', name: 'No CGST on inter-state', ruleType: ZxRuleType.APPLICABILITY, taxId: 'tax1',
        priority: 10, resultApplicable: false, conditionExpression: { field: 'intraState', op: 'isFalse' } },
    ]);
    const result = await service.determineTax('t1', 'IN_GST', { date: '2026-06-01', amount: 1000, intraState: false });
    expect(result).toHaveLength(0); // CGST excluded for inter-state
  });

  it('determineTax — STATUS rule overrides to EXEMPT (zero rate)', async () => {
    regimeRepo.findOne.mockResolvedValue({ id: 'r1', code: 'IN_GST', effectiveFrom: '2017-07-01', effectiveTo: null });
    taxRepo.find.mockResolvedValue([{ id: 'tax1', code: 'IGST', name: 'IGST', isActive: true }]);
    ruleRepo.find.mockResolvedValue([
      { id: 'rule1', name: 'Exempt food', ruleType: ZxRuleType.STATUS, taxId: 'tax1', priority: 10,
        resultStatusId: 'sExempt', conditionExpression: { field: 'itemCategory', op: 'eq', value: 'FOOD' } },
    ]);
    statusRepo.findOne.mockResolvedValue({ id: 'sExempt', code: 'EXEMPT', taxId: 'tax1' });
    rateRepo.find.mockResolvedValue([{ id: 'rt0', code: 'ZERO', rate: 0, isDefault: true, effectiveFrom: '2017-07-01', effectiveTo: null, glAccountId: null }]);

    const result = await service.determineTax('t1', 'IN_GST', { date: '2026-06-01', amount: 1000, itemCategory: 'FOOD' });
    expect(result[0].statusCode).toBe('EXEMPT');
    expect(result[0].taxAmount).toBe(0);
  });

  // ─── Ph-124: reporting ────────────────────────────────────────────

  it('taxReturnSummary — nets output vs input tax', async () => {
    const lines = [
      { documentType: TaxDocumentType.INVOICE, componentName: 'IGST', taxCodeCode: 'IGST', baseAmount: 1000, taxAmount: 180 },
      { documentType: TaxDocumentType.INVOICE, componentName: 'IGST', taxCodeCode: 'IGST', baseAmount: 2000, taxAmount: 360 },
      { documentType: TaxDocumentType.BILL, componentName: 'IGST', taxCodeCode: 'IGST', baseAmount: 500, taxAmount: 90 },
    ];
    taxLineRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(lines),
    });
    const summary = await service.taxReturnSummary('t1', '2026-04-01', '2026-06-30');
    expect(summary.outputTax).toBe(540);
    expect(summary.inputTax).toBe(90);
    expect(summary.netPayable).toBe(450);
    expect(summary.outputByComponent[0]).toMatchObject({ component: 'IGST', tax: 540 });
  });

  it('gstr3bSummary — maps to outward/inward blocks', async () => {
    taxLineRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { documentType: TaxDocumentType.INVOICE, componentName: 'IGST', taxCodeCode: 'IGST', baseAmount: 1000, taxAmount: 180 },
      ]),
    });
    const r = await service.gstr3bSummary('t1', '2026-04-01', '2026-06-30');
    expect(r.outwardSupplies.taxAmount).toBe(180);
    expect(r.netTaxPayable).toBe(180);
  });
});
