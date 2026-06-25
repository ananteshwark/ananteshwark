import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SlaService } from './sla.service';
import { SlaRule, SlaEventClass, SlaLineType } from './entities/sla-rule.entity';
import { XlaAccountingEvent } from './entities/xla-accounting-event.entity';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn((x) => Promise.resolve({ id: 'rule-1', ...x })),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('SlaService — Phase 93–95', () => {
  let service: SlaService;
  let ruleRepo: ReturnType<typeof mockRepo>;
  let xlaRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    ruleRepo = mockRepo();
    xlaRepo = mockRepo();

    const module = await Test.createTestingModule({
      providers: [
        SlaService,
        { provide: getRepositoryToken(SlaRule), useValue: ruleRepo },
        { provide: getRepositoryToken(XlaAccountingEvent), useValue: xlaRepo },
      ],
    }).compile();

    service = module.get(SlaService);
  });

  // ─── Rule CRUD ─────────────────────────────────────────────────────

  it('createRule — happy path', async () => {
    const rule = await service.createRule('t1', {
      name: 'AR Control',
      eventClass: SlaEventClass.AR_INVOICE,
      lineType: SlaLineType.DEBIT,
      priority: 10,
      accountId: 'acc-ar',
    });
    expect(ruleRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventClass: 'AR_INVOICE', lineType: 'DEBIT', accountId: 'acc-ar' }),
    );
    expect(rule.id).toBe('rule-1');
  });

  it('createRule — rejects missing accountId', async () => {
    await expect(
      service.createRule('t1', {
        name: 'Bad rule',
        eventClass: SlaEventClass.AR_INVOICE,
        lineType: SlaLineType.DEBIT,
        accountId: '',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('createRule — rejects invalid eventClass', async () => {
    await expect(
      service.createRule('t1', {
        name: 'Bad',
        eventClass: 'FAKE_EVENT' as SlaEventClass,
        lineType: SlaLineType.DEBIT,
        accountId: 'acc-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('createRule — validates conditionExpression leaf structure', async () => {
    await expect(
      service.createRule('t1', {
        name: 'Bad cond',
        eventClass: SlaEventClass.AP_INVOICE,
        lineType: SlaLineType.CREDIT,
        accountId: 'acc-2',
        conditionExpression: { op: 'eq', value: 'USD' }, // missing "field"
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('listRules — filters by eventClass', async () => {
    ruleRepo.find.mockResolvedValue([]);
    await service.listRules('t1', SlaEventClass.AR_INVOICE);
    expect(ruleRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', eventClass: 'AR_INVOICE' } }),
    );
  });

  it('getRule — throws NotFoundException when missing', async () => {
    ruleRepo.findOne.mockResolvedValue(null);
    await expect(service.getRule('t1', 'no-such-id')).rejects.toThrow(NotFoundException);
  });

  it('updateRule — patches fields and saves', async () => {
    const existing = { id: 'rule-1', tenantId: 't1', name: 'Old', priority: 50 };
    ruleRepo.findOne.mockResolvedValue(existing);
    ruleRepo.save.mockResolvedValue({ ...existing, priority: 20 });
    const result = await service.updateRule('t1', 'rule-1', { priority: 20 });
    expect(ruleRepo.save).toHaveBeenCalled();
    expect(result.priority).toBe(20);
  });

  it('deleteRule — removes entity', async () => {
    const existing = { id: 'rule-1', tenantId: 't1' };
    ruleRepo.findOne.mockResolvedValue(existing);
    await service.deleteRule('t1', 'rule-1');
    expect(ruleRepo.remove).toHaveBeenCalledWith(existing);
  });

  // ─── deriveAccount ─────────────────────────────────────────────────

  it('deriveAccount — returns null when no rules exist', async () => {
    ruleRepo.find.mockResolvedValue([]);
    const result = await service.deriveAccount('t1', SlaEventClass.AR_INVOICE, SlaLineType.DEBIT, {});
    expect(result).toBeNull();
  });

  it('deriveAccount — picks first matching rule (catch-all, no condition)', async () => {
    ruleRepo.find.mockResolvedValue([
      { id: 'r1', accountId: 'acc-ar', conditionExpression: null, name: 'AR Default' },
    ]);
    const result = await service.deriveAccount('t1', SlaEventClass.AR_INVOICE, SlaLineType.DEBIT, { currency: 'USD' });
    expect(result).toMatchObject({ accountId: 'acc-ar', ruleId: 'r1', ruleName: 'AR Default', derivedViaRule: true });
  });

  it('deriveAccount — skips rule when condition does not match', async () => {
    ruleRepo.find.mockResolvedValue([
      {
        id: 'r1',
        accountId: 'acc-foreign',
        name: 'Foreign AR',
        conditionExpression: { field: 'currency', op: 'neq', value: 'USD' },
      },
    ]);
    const result = await service.deriveAccount('t1', SlaEventClass.AR_INVOICE, SlaLineType.DEBIT, { currency: 'USD' });
    expect(result).toBeNull();
  });

  it('deriveAccount — returns matching rule when condition passes', async () => {
    ruleRepo.find.mockResolvedValue([
      {
        id: 'r1',
        accountId: 'acc-foreign',
        name: 'Foreign AR',
        conditionExpression: { field: 'currency', op: 'neq', value: 'USD' },
      },
    ]);
    const result = await service.deriveAccount('t1', SlaEventClass.AR_INVOICE, SlaLineType.DEBIT, { currency: 'EUR' });
    expect(result?.accountId).toBe('acc-foreign');
  });

  it('deriveAccount — evaluates AND condition correctly', async () => {
    const andCond = {
      and: [
        { field: 'currency', op: 'neq', value: 'USD' },
        { field: 'amount', op: 'gt', value: 1000 },
      ],
    };
    ruleRepo.find.mockResolvedValue([{ id: 'r1', accountId: 'acc-1', name: 'Large Foreign', conditionExpression: andCond }]);
    // passes: EUR > 1000
    const yes = await service.deriveAccount('t1', SlaEventClass.AR_INVOICE, SlaLineType.DEBIT, { currency: 'EUR', amount: 5000 });
    expect(yes?.accountId).toBe('acc-1');
    // fails: USD > 1000 — currency check fails
    const no = await service.deriveAccount('t1', SlaEventClass.AR_INVOICE, SlaLineType.DEBIT, { currency: 'USD', amount: 5000 });
    expect(no).toBeNull();
  });

  it('deriveAccount — evaluates OR condition correctly', async () => {
    const orCond = {
      or: [
        { field: 'currency', op: 'eq', value: 'EUR' },
        { field: 'currency', op: 'eq', value: 'GBP' },
      ],
    };
    ruleRepo.find.mockResolvedValue([{ id: 'r1', accountId: 'acc-eu', name: 'EU Currencies', conditionExpression: orCond }]);
    const gbp = await service.deriveAccount('t1', SlaEventClass.AR_INVOICE, SlaLineType.DEBIT, { currency: 'GBP' });
    expect(gbp?.accountId).toBe('acc-eu');
    const usd = await service.deriveAccount('t1', SlaEventClass.AR_INVOICE, SlaLineType.DEBIT, { currency: 'USD' });
    expect(usd).toBeNull();
  });

  it('deriveAccount — evaluates NOT condition correctly', async () => {
    ruleRepo.find.mockResolvedValue([
      { id: 'r1', accountId: 'acc-non-usd', name: 'Non-USD', conditionExpression: { not: { field: 'currency', op: 'eq', value: 'USD' } } },
    ]);
    const eur = await service.deriveAccount('t1', SlaEventClass.AR_INVOICE, SlaLineType.DEBIT, { currency: 'EUR' });
    expect(eur?.accountId).toBe('acc-non-usd');
    const usd = await service.deriveAccount('t1', SlaEventClass.AR_INVOICE, SlaLineType.DEBIT, { currency: 'USD' });
    expect(usd).toBeNull();
  });

  it('deriveAccount — respects priority order (lower wins)', async () => {
    ruleRepo.find.mockResolvedValue([
      { id: 'r10', accountId: 'acc-priority10', name: 'P10', conditionExpression: null },
      { id: 'r50', accountId: 'acc-priority50', name: 'P50', conditionExpression: null },
    ]);
    const result = await service.deriveAccount('t1', SlaEventClass.AR_INVOICE, SlaLineType.DEBIT, {});
    expect(result?.ruleId).toBe('r10');
  });

  it('deriveAccount — resolves nested field path (dot notation)', async () => {
    ruleRepo.find.mockResolvedValue([
      { id: 'r1', accountId: 'acc-overseas', name: 'Overseas', conditionExpression: { field: 'vendor.category', op: 'eq', value: 'OVERSEAS' } },
    ]);
    const result = await service.deriveAccount('t1', SlaEventClass.AP_INVOICE, SlaLineType.CREDIT, { vendor: { category: 'OVERSEAS' } });
    expect(result?.accountId).toBe('acc-overseas');
  });

  // ─── evaluateCondition (unit tests for all ops) ────────────────────

  describe('evaluateCondition', () => {
    it('null expression → always true', () => {
      expect(service.evaluateCondition(null, {})).toBe(true);
    });

    it('eq / neq', () => {
      expect(service.evaluateCondition({ field: 'x', op: 'eq', value: 5 }, { x: 5 })).toBe(true);
      expect(service.evaluateCondition({ field: 'x', op: 'neq', value: 5 }, { x: 5 })).toBe(false);
    });

    it('gt / gte / lt / lte', () => {
      expect(service.evaluateCondition({ field: 'n', op: 'gt', value: 10 }, { n: 11 })).toBe(true);
      expect(service.evaluateCondition({ field: 'n', op: 'gte', value: 10 }, { n: 10 })).toBe(true);
      expect(service.evaluateCondition({ field: 'n', op: 'lt', value: 10 }, { n: 9 })).toBe(true);
      expect(service.evaluateCondition({ field: 'n', op: 'lte', value: 10 }, { n: 10 })).toBe(true);
    });

    it('in / nin', () => {
      expect(service.evaluateCondition({ field: 'c', op: 'in', value: ['EUR', 'GBP'] }, { c: 'EUR' })).toBe(true);
      expect(service.evaluateCondition({ field: 'c', op: 'nin', value: ['EUR', 'GBP'] }, { c: 'USD' })).toBe(true);
    });

    it('contains / startsWith', () => {
      expect(service.evaluateCondition({ field: 's', op: 'contains', value: 'foo' }, { s: 'foobar' })).toBe(true);
      expect(service.evaluateCondition({ field: 's', op: 'startsWith', value: 'foo' }, { s: 'foobar' })).toBe(true);
      expect(service.evaluateCondition({ field: 's', op: 'startsWith', value: 'bar' }, { s: 'foobar' })).toBe(false);
    });

    it('null / notNull ops', () => {
      expect(service.evaluateCondition({ field: 'x', op: 'null' }, { x: null })).toBe(true);
      expect(service.evaluateCondition({ field: 'x', op: 'notNull' }, { x: 'val' })).toBe(true);
    });
  });

  // ─── XLA Audit Trail ───────────────────────────────────────────────

  it('logAccountingEvent — persists XLA record', async () => {
    xlaRepo.create.mockReturnValue({ id: 'xla-1' });
    xlaRepo.save.mockResolvedValue({ id: 'xla-1' });
    const result = await service.logAccountingEvent({
      tenantId: 't1',
      eventClass: SlaEventClass.AR_INVOICE,
      sourceDocumentId: 'inv-1',
      sourceDocumentType: 'AR_INVOICE',
      accountId: 'acc-ar',
      debit: 1000,
    });
    expect(xlaRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceDocumentId: 'inv-1', debit: 1000 }),
    );
    expect(result.id).toBe('xla-1');
  });

  it('getAuditTrail — applies sourceDocumentId filter', async () => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    xlaRepo.createQueryBuilder.mockReturnValue(qb);
    await service.getAuditTrail('t1', { sourceDocumentId: 'inv-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('xla.source_document_id = :sid', { sid: 'inv-1' });
  });
});
