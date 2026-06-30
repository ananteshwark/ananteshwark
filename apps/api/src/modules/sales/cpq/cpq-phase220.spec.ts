import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CpqService } from './cpq.service';
import { CpqProductModel } from './entities/cpq-product-model.entity';
import { CpqQuote, CpqQuoteStatus } from './entities/cpq-quote.entity';
import { CpqGuidedQuestionnaire } from './entities/cpq-guided-questionnaire.entity';
import { SalesOrder } from '../entities/sales-order.entity';
import { SalesOrderLine } from '../entities/sales-order-line.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

const MODEL = {
  code: 'LAPTOP', name: 'Laptop', basePrice: 1000, currency: 'USD',
  optionGroups: [
    { id: 'cpu', name: 'CPU', required: true, minSelect: 1, maxSelect: 1, options: [{ code: 'I5', name: 'i5', priceDelta: 0 }, { code: 'I7', name: 'i7', priceDelta: 300 }] },
    { id: 'ram', name: 'RAM', required: false, minSelect: 0, maxSelect: 2, options: [{ code: 'R16', name: '16GB', priceDelta: 100 }, { code: 'R32', name: '32GB', priceDelta: 250 }] },
  ],
  constraints: [{ type: 'REQUIRES', if: 'R32', then: 'I7' }],
};

describe('CpqService — Phase 220-224', () => {
  let service: CpqService;
  let modelRepo: any, quoteRepo: any, guidedRepo: any, soRepo: any, soLineRepo: any;

  beforeEach(async () => {
    modelRepo = mockRepo(); quoteRepo = mockRepo(); guidedRepo = mockRepo(); soRepo = mockRepo(); soLineRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        CpqService,
        { provide: getRepositoryToken(CpqProductModel), useValue: modelRepo },
        { provide: getRepositoryToken(CpqQuote), useValue: quoteRepo },
        { provide: getRepositoryToken(CpqGuidedQuestionnaire), useValue: guidedRepo },
        { provide: getRepositoryToken(SalesOrder), useValue: soRepo },
        { provide: getRepositoryToken(SalesOrderLine), useValue: soLineRepo },
      ],
    }).compile();
    service = module.get(CpqService);
  });

  // ─── Ph-220: configurator ─────────────────────────────────────────

  it('validateConfiguration — valid config prices base + deltas', async () => {
    modelRepo.findOne.mockResolvedValue(MODEL);
    const r = await service.validateConfiguration('t1', 'LAPTOP', ['I7', 'R16']);
    expect(r.valid).toBe(true);
    expect(r.configuredPrice).toBe(1400); // 1000 + 300 + 100
  });

  it('validateConfiguration — missing required group fails', async () => {
    modelRepo.findOne.mockResolvedValue(MODEL);
    const r = await service.validateConfiguration('t1', 'LAPTOP', ['R16']);
    expect(r.valid).toBe(false);
    expect(r.violations.join(' ')).toContain('CPU');
  });

  it('validateConfiguration — REQUIRES constraint enforced', async () => {
    modelRepo.findOne.mockResolvedValue(MODEL);
    const r = await service.validateConfiguration('t1', 'LAPTOP', ['I5', 'R32']);
    expect(r.valid).toBe(false);
    expect(r.violations.join(' ')).toContain('requires');
  });

  it('validateConfiguration — exceeding a group maxSelect fails', async () => {
    modelRepo.findOne.mockResolvedValue(MODEL);
    // Two CPUs selected violates CPU maxSelect = 1.
    const r = await service.validateConfiguration('t1', 'LAPTOP', ['I5', 'I7']);
    expect(r.valid).toBe(false);
    expect(r.violations.join(' ')).toContain('at most');
  });

  // ─── Ph-221: pricing waterfall ────────────────────────────────────

  it('createQuote — applies sequential discount waterfall', async () => {
    modelRepo.findOne.mockResolvedValue(MODEL);
    quoteRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const q = await service.createQuote('t1', { modelCode: 'LAPTOP', selectedOptions: ['I5'], quantity: 2, customerDiscountPct: 10, volumeDiscountPct: 5 });
    // list 1000 → *0.9 = 900 → *0.95 = 855
    expect(q.listPrice).toBe(1000);
    expect(q.netUnitPrice).toBe(855);
    expect(q.netTotal).toBe(1710);
    expect(q.requiresApproval).toBe(false);
  });

  it('createQuote — flags approval when total discount exceeds threshold', async () => {
    modelRepo.findOne.mockResolvedValue(MODEL);
    quoteRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const q = await service.createQuote('t1', { modelCode: 'LAPTOP', selectedOptions: ['I5'], customerDiscountPct: 25, volumeDiscountPct: 10 });
    // 1 - 0.75*0.9 = 0.325 → 32.5% > 30
    expect(q.requiresApproval).toBe(true);
    expect(q.totalDiscountPct).toBe(32.5);
  });

  it('createQuote — rejects an invalid configuration', async () => {
    modelRepo.findOne.mockResolvedValue(MODEL);
    await expect(service.createQuote('t1', { modelCode: 'LAPTOP', selectedOptions: [] })).rejects.toThrow(BadRequestException);
  });

  it('submitForApproval — auto-approves when no approval needed', async () => {
    quoteRepo.findOne.mockResolvedValue({ id: 'q1', status: CpqQuoteStatus.PRICED, requiresApproval: false });
    quoteRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.submitForApproval('t1', 'q1');
    expect(r.status).toBe(CpqQuoteStatus.APPROVED);
  });

  it('submitForApproval — routes to pending when approval required', async () => {
    quoteRepo.findOne.mockResolvedValue({ id: 'q1', status: CpqQuoteStatus.PRICED, requiresApproval: true });
    quoteRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.submitForApproval('t1', 'q1');
    expect(r.status).toBe(CpqQuoteStatus.APPROVAL_PENDING);
  });

  // ─── Ph-222: guided selling ───────────────────────────────────────

  it('recommend — ranks models by weighted answers', async () => {
    guidedRepo.findOne.mockResolvedValue({
      code: 'GS', questions: [
        { id: 'q1', text: 'Use?', answers: [{ value: 'gaming', modelCode: 'GAMER', weight: 3 }, { value: 'office', modelCode: 'LAPTOP', weight: 2 }] },
        { id: 'q2', text: 'Budget?', answers: [{ value: 'high', modelCode: 'GAMER', weight: 2 }] },
      ],
    });
    const r = await service.recommend('t1', 'GS', [{ questionId: 'q1', value: 'gaming' }, { questionId: 'q2', value: 'high' }]);
    expect(r.recommended).toBe('GAMER');
    expect(r.ranked[0].score).toBe(5);
  });

  // ─── Ph-223: quote document ───────────────────────────────────────

  it('quoteDocument — includes options and T&Cs', async () => {
    quoteRepo.findOne.mockResolvedValue({ id: 'q1', quoteNumber: 'CPQ-1', status: 'APPROVED', modelCode: 'LAPTOP', selectedOptions: ['I7'], quantity: 1, listPrice: 1300, customerDiscountPct: 0, volumeDiscountPct: 0, promoDiscountPct: 0, netUnitPrice: 1300, netTotal: 1300, totalDiscountPct: 0, currency: 'USD' });
    modelRepo.findOne.mockResolvedValue(MODEL);
    const doc = await service.quoteDocument('t1', 'q1');
    expect(doc.options).toEqual([{ group: 'CPU', option: 'i7', priceDelta: 300 }]);
    expect(doc.termsAndConditions.length).toBeGreaterThan(0);
  });

  // ─── Ph-224: quote-to-order ───────────────────────────────────────

  it('convertToOrder — creates an SO from an approved quote', async () => {
    quoteRepo.findOne.mockResolvedValue({ id: 'q1', status: CpqQuoteStatus.APPROVED, modelCode: 'LAPTOP', selectedOptions: ['I7'], quantity: 1, listPrice: 1300, netUnitPrice: 1300, netTotal: 1300, currency: 'USD', soId: null });
    modelRepo.findOne.mockResolvedValue(MODEL);
    soRepo.save.mockImplementation((x: any) => Promise.resolve({ ...x, id: 'so-1' }));
    soLineRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    quoteRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.convertToOrder('t1', 'q1');
    expect(r.orderId).toBe('so-1');
    expect(soLineRepo.save).toHaveBeenCalled();
  });

  it('convertToOrder — rejects non-approved quote', async () => {
    quoteRepo.findOne.mockResolvedValue({ id: 'q1', status: CpqQuoteStatus.PRICED });
    await expect(service.convertToOrder('t1', 'q1')).rejects.toThrow(BadRequestException);
  });
});
