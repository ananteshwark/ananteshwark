import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransferPricingService } from './transfer-pricing.service';
import { IcBillingService } from './ic-billing.service';
import { IntercompanyService } from './intercompany.service';
import { IcTransferPrice, TransferPricingMethod } from './entities/ic-transfer-price.entity';
import { IcRelationship } from './entities/ic-relationship.entity';
import { IcTransaction, IcTransactionStatus } from './entities/ic-transaction.entity';
import { Account } from '../gl/entities/account.entity';
import { ConsolidationGroup } from '../consolidation/entities/consolidation-group.entity';
import { ArService } from '../ar/ar.service';
import { ApService } from '../ap/ap.service';
import { GlService } from '../gl/gl.service';

// ─── Repository mock factories ────────────────────────────────────────────────

const mockRepo = () => ({
  create: jest.fn((d) => d),
  save: jest.fn(async (d) => (Array.isArray(d) ? d : { id: 'new-id', ...d })),
  findOne: jest.fn(),
  find: jest.fn(async () => []),
  remove: jest.fn(async (e) => e),
  createQueryBuilder: jest.fn(),
});

const makeQb = (results: any[]) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(results),
});

const TENANT = 'tenant-1';
const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';
const UUID_C = '33333333-3333-3333-3333-333333333333';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeRule = (overrides: Partial<IcTransferPrice> = {}): IcTransferPrice => ({
  id: 'rule-1',
  tenantId: TENANT,
  sellingEntityId: UUID_A,
  buyingEntityId: UUID_B,
  itemCode: null,
  method: TransferPricingMethod.FIXED,
  costPlusPercent: 0,
  fixedPrice: 100,
  marketPrice: null,
  currency: 'USD',
  validFrom: '2025-01-01',
  validTo: null,
  isActive: true,
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeRelationship = (overrides: Partial<IcRelationship> = {}): IcRelationship => ({
  id: 'rel-1',
  tenantId: TENANT,
  sellingEntityId: UUID_A,
  buyingEntityId: UUID_B,
  markupPercent: 0,
  eliminationAccountId: null,
  icCustomerId: null,
  icVendorId: 'vendor-1',
  revenueAccountId: null,
  expenseAccountId: null,
  isActive: true,
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeInvoice = (overrides: Record<string, any> = {}) => ({
  id: 'inv-1',
  tenantId: TENANT,
  invoiceNumber: 'INV-001',
  invoiceDate: '2026-01-10',
  currency: 'USD',
  subtotal: 1000,
  total: 1100,
  customerId: 'cust-1',
  lines: [
    { id: 'line-1', description: 'Service', quantity: 1, unitPrice: 1100, taxRate: 0 },
  ],
  ...overrides,
});

const makeTxn = (overrides: Partial<IcTransaction> = {}): IcTransaction => ({
  id: 'txn-1',
  tenantId: TENANT,
  icNumber: 'IC-000001',
  relationshipId: 'rel-1',
  sellingEntityId: UUID_A,
  buyingEntityId: UUID_B,
  transactionDate: '2026-01-10',
  description: null,
  baseAmount: 1000,
  markupAmount: 0,
  totalAmount: 1100,
  status: IcTransactionStatus.POSTED,
  sellingDocType: 'IC_AR',
  buyingDocType: 'IC_AP',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ─── TransferPricingService ───────────────────────────────────────────────────

describe('TransferPricingService', () => {
  let service: TransferPricingService;
  let priceRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    priceRepo = mockRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransferPricingService,
        { provide: getRepositoryToken(IcTransferPrice), useValue: priceRepo },
      ],
    }).compile();
    service = module.get(TransferPricingService);
  });

  // ─── computePrice ────────────────────────────────────────────────────────────

  describe('computePrice', () => {
    it('FIXED: returns fixedPrice', () => {
      const rule = makeRule({ method: TransferPricingMethod.FIXED, fixedPrice: 250 });
      expect(service.computePrice(rule)).toBe(250);
    });

    it('MARKET: returns marketPrice', () => {
      const rule = makeRule({ method: TransferPricingMethod.MARKET, marketPrice: 320.5 });
      expect(service.computePrice(rule)).toBe(320.5);
    });

    it('COST_PLUS: applies markup over baseCost', () => {
      const rule = makeRule({
        method: TransferPricingMethod.COST_PLUS,
        costPlusPercent: 20,
      });
      expect(service.computePrice(rule, 100)).toBeCloseTo(120, 3);
    });

    it('COST_PLUS with 0 baseCost gives 0', () => {
      const rule = makeRule({ method: TransferPricingMethod.COST_PLUS, costPlusPercent: 15 });
      expect(service.computePrice(rule, 0)).toBe(0);
    });

    it('COST_PLUS without baseCost defaults to 0', () => {
      const rule = makeRule({ method: TransferPricingMethod.COST_PLUS, costPlusPercent: 10 });
      expect(service.computePrice(rule)).toBe(0);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('persists a valid FIXED rule', async () => {
      const dto = {
        sellingEntityId: UUID_A,
        buyingEntityId: UUID_B,
        method: TransferPricingMethod.FIXED,
        fixedPrice: 500,
        validFrom: '2025-01-01',
      };
      await service.create(TENANT, dto as any);
      expect(priceRepo.save).toHaveBeenCalled();
    });

    it('rejects when selling and buying entity are the same', async () => {
      await expect(
        service.create(TENANT, {
          sellingEntityId: UUID_A,
          buyingEntityId: UUID_A,
          method: TransferPricingMethod.FIXED,
          fixedPrice: 100,
          validFrom: '2025-01-01',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects FIXED method without fixedPrice', async () => {
      await expect(
        service.create(TENANT, {
          sellingEntityId: UUID_A,
          buyingEntityId: UUID_B,
          method: TransferPricingMethod.FIXED,
          fixedPrice: null,
          validFrom: '2025-01-01',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects MARKET method without marketPrice', async () => {
      await expect(
        service.create(TENANT, {
          sellingEntityId: UUID_A,
          buyingEntityId: UUID_B,
          method: TransferPricingMethod.MARKET,
          marketPrice: null,
          validFrom: '2025-01-01',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when rule does not exist', async () => {
      priceRepo.findOne.mockResolvedValue(null);
      await expect(service.update(TENANT, 'bad-id', {})).rejects.toThrow(NotFoundException);
    });

    it('changes the method and price', async () => {
      priceRepo.findOne.mockResolvedValue(makeRule());
      await service.update(TENANT, 'rule-1', {
        method: TransferPricingMethod.MARKET,
        marketPrice: 999,
      } as any);
      const saved = priceRepo.save.mock.calls[0][0];
      expect(saved.method).toBe(TransferPricingMethod.MARKET);
      expect(saved.marketPrice).toBe(999);
    });

    it('deactivates an active rule', async () => {
      priceRepo.findOne.mockResolvedValue(makeRule());
      await service.update(TENANT, 'rule-1', { isActive: false } as any);
      const saved = priceRepo.save.mock.calls[0][0];
      expect(saved.isActive).toBe(false);
    });
  });

  // ─── resolve ─────────────────────────────────────────────────────────────────

  describe('resolve', () => {
    it('returns unresolved when no candidates found', async () => {
      priceRepo.createQueryBuilder.mockReturnValue(makeQb([]));
      const res = await service.resolve(TENANT, {
        sellingEntityId: UUID_A,
        buyingEntityId: UUID_B,
      });
      expect(res.resolved).toBe(false);
      expect(res.unitPrice).toBeNull();
    });

    it('resolves a FIXED pair-default rule', async () => {
      const rule = makeRule({ method: TransferPricingMethod.FIXED, fixedPrice: 200, itemCode: null });
      priceRepo.createQueryBuilder.mockReturnValue(makeQb([rule]));
      const res = await service.resolve(TENANT, {
        sellingEntityId: UUID_A,
        buyingEntityId: UUID_B,
      });
      expect(res.resolved).toBe(true);
      expect(res.unitPrice).toBe(200);
      expect(res.itemSpecific).toBe(false);
    });

    it('prefers item-specific rule over pair default', async () => {
      const defaultRule = makeRule({ id: 'def', method: TransferPricingMethod.FIXED, fixedPrice: 100, itemCode: null });
      const itemRule = makeRule({ id: 'item', method: TransferPricingMethod.FIXED, fixedPrice: 150, itemCode: 'SKU-001' });
      priceRepo.createQueryBuilder.mockReturnValue(makeQb([defaultRule, itemRule]));
      const res = await service.resolve(TENANT, {
        sellingEntityId: UUID_A,
        buyingEntityId: UUID_B,
        itemCode: 'SKU-001',
      });
      expect(res.unitPrice).toBe(150);
      expect(res.ruleId).toBe('item');
      expect(res.itemSpecific).toBe(true);
    });

    it('falls back to pair default when item has no specific rule', async () => {
      const defaultRule = makeRule({ method: TransferPricingMethod.FIXED, fixedPrice: 100, itemCode: null });
      priceRepo.createQueryBuilder.mockReturnValue(makeQb([defaultRule]));
      const res = await service.resolve(TENANT, {
        sellingEntityId: UUID_A,
        buyingEntityId: UUID_B,
        itemCode: 'SKU-999',
      });
      expect(res.unitPrice).toBe(100);
      expect(res.itemSpecific).toBe(false);
    });

    it('resolves COST_PLUS using provided baseCost', async () => {
      const rule = makeRule({
        method: TransferPricingMethod.COST_PLUS,
        costPlusPercent: 25,
        fixedPrice: null,
      });
      priceRepo.createQueryBuilder.mockReturnValue(makeQb([rule]));
      const res = await service.resolve(TENANT, {
        sellingEntityId: UUID_A,
        buyingEntityId: UUID_B,
        baseCost: 80,
      });
      expect(res.resolved).toBe(true);
      expect(res.unitPrice).toBeCloseTo(100, 2);
    });
  });
});

// ─── IcBillingService ────────────────────────────────────────────────────────

describe('IcBillingService', () => {
  let service: IcBillingService;
  let relRepo: ReturnType<typeof mockRepo>;
  let txnRepo: ReturnType<typeof mockRepo>;
  let accountRepo: ReturnType<typeof mockRepo>;
  let groupRepo: ReturnType<typeof mockRepo>;
  let intercompanyService: any;
  let arService: any;
  let apService: any;
  let glService: any;

  beforeEach(async () => {
    relRepo = mockRepo();
    txnRepo = mockRepo();
    accountRepo = mockRepo();
    groupRepo = mockRepo();

    intercompanyService = {
      recordPostedTransaction: jest.fn(async () => ({
        id: 'txn-new',
        icNumber: 'IC-000002',
      })),
    };
    arService = {
      findInvoice: jest.fn(async () => makeInvoice()),
    };
    apService = {
      createBill: jest.fn(async () => ({ id: 'bill-1', billNumber: 'IC-BILL-INV-001' })),
      postBill: jest.fn(async () => ({})),
    };
    glService = {
      findAccount: jest.fn(async () => ({ id: 'acct-cogs', code: '5000' })),
      postJournalEntry: jest.fn(async () => ({ id: 'je-1' })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IcBillingService,
        { provide: getRepositoryToken(IcRelationship), useValue: relRepo },
        { provide: getRepositoryToken(IcTransaction), useValue: txnRepo },
        { provide: getRepositoryToken(Account), useValue: accountRepo },
        { provide: getRepositoryToken(ConsolidationGroup), useValue: groupRepo },
        { provide: IntercompanyService, useValue: intercompanyService },
        { provide: ArService, useValue: arService },
        { provide: ApService, useValue: apService },
        { provide: GlService, useValue: glService },
      ],
    }).compile();
    service = module.get(IcBillingService);
  });

  // ─── generateMirrorBill ────────────────────────────────────────────────────

  describe('generateMirrorBill', () => {
    it('throws when relationship is not found', async () => {
      relRepo.findOne.mockResolvedValue(null);
      await expect(
        service.generateMirrorBill(TENANT, 'inv-1', 'rel-bad', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when icVendorId is not set on the relationship', async () => {
      relRepo.findOne.mockResolvedValue(makeRelationship({ icVendorId: null }));
      await expect(
        service.generateMirrorBill(TENANT, 'inv-1', 'rel-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when a mirror bill already exists for the invoice', async () => {
      relRepo.findOne.mockResolvedValue(makeRelationship());
      txnRepo.findOne.mockResolvedValue(makeTxn());
      await expect(
        service.generateMirrorBill(TENANT, 'inv-1', 'rel-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates AP bill and IC transaction on success', async () => {
      relRepo.findOne.mockResolvedValue(makeRelationship());
      txnRepo.findOne.mockResolvedValue(null);
      accountRepo.findOne.mockResolvedValue({ id: 'acct-exp', code: '5000' });

      const result = await service.generateMirrorBill(TENANT, 'inv-1', 'rel-1', 'user-1');

      expect(result.billId).toBe('bill-1');
      expect(result.billNumber).toBe('IC-BILL-INV-001');
      expect(result.icTransactionId).toBe('txn-new');
      expect(apService.createBill).toHaveBeenCalledTimes(1);
      expect(apService.postBill).toHaveBeenCalledWith(TENANT, 'bill-1', 'user-1');
      expect(intercompanyService.recordPostedTransaction).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({
          sellingEntityId: UUID_A,
          buyingEntityId: UUID_B,
        }),
      );
    });

    it('returns the total from the AR invoice', async () => {
      relRepo.findOne.mockResolvedValue(makeRelationship());
      txnRepo.findOne.mockResolvedValue(null);
      arService.findInvoice.mockResolvedValue(makeInvoice({ total: 5500 }));
      accountRepo.findOne.mockResolvedValue({ id: 'acct-exp' });

      const result = await service.generateMirrorBill(TENANT, 'inv-1', 'rel-1', 'user-1');
      expect(result.total).toBe(5500);
    });
  });

  // ─── generateEliminationEntries ───────────────────────────────────────────────

  describe('generateEliminationEntries', () => {
    it('returns zeros when there are no POSTED transactions', async () => {
      txnRepo.find.mockResolvedValue([]);
      const result = await service.generateEliminationEntries(
        TENANT,
        { periodEnd: '2026-01-31' },
        'user-1',
      );
      expect(result.eliminatedCount).toBe(0);
      expect(result.journalEntryId).toBeNull();
      expect(result.totalEliminated).toBe(0);
    });

    it('eliminates all in-scope POSTED transactions', async () => {
      const txn1 = makeTxn({ id: 't1', totalAmount: 1000, transactionDate: '2026-01-05' });
      const txn2 = makeTxn({ id: 't2', totalAmount: 500, transactionDate: '2026-01-20' });
      txnRepo.find.mockResolvedValue([txn1, txn2]);
      relRepo.find.mockResolvedValue([makeRelationship()]);
      accountRepo.findOne.mockResolvedValue({ id: 'acct-rev', code: '4000' });

      const result = await service.generateEliminationEntries(
        TENANT,
        { periodEnd: '2026-01-31' },
        'user-1',
      );

      expect(result.eliminatedCount).toBe(2);
      expect(result.totalEliminated).toBe(1500);
      expect(result.journalEntryId).toBe('je-1');
      expect(glService.postJournalEntry).toHaveBeenCalledTimes(1);
    });

    it('excludes transactions after the period end', async () => {
      const inPeriod = makeTxn({ id: 't1', totalAmount: 1000, transactionDate: '2026-01-15' });
      const outOfPeriod = makeTxn({ id: 't2', totalAmount: 800, transactionDate: '2026-02-01' });
      txnRepo.find.mockResolvedValue([inPeriod, outOfPeriod]);
      relRepo.find.mockResolvedValue([]);
      accountRepo.findOne.mockResolvedValue({ id: 'acct-rev' });

      const result = await service.generateEliminationEntries(
        TENANT,
        { periodEnd: '2026-01-31' },
        'user-1',
      );

      expect(result.eliminatedCount).toBe(1);
      expect(result.totalEliminated).toBe(1000);
    });

    it('scopes to consolidation group members when groupId provided', async () => {
      const group: Partial<ConsolidationGroup> = {
        id: 'grp-1',
        tenantId: TENANT,
        memberEntityIds: [UUID_A, UUID_B],
      };
      groupRepo.findOne.mockResolvedValue(group);

      const inGroup = makeTxn({
        id: 't1',
        sellingEntityId: UUID_A,
        buyingEntityId: UUID_B,
        totalAmount: 2000,
        transactionDate: '2026-01-10',
      });
      const outsideGroup = makeTxn({
        id: 't2',
        sellingEntityId: UUID_C,
        buyingEntityId: UUID_B,
        totalAmount: 999,
        transactionDate: '2026-01-10',
      });
      txnRepo.find.mockResolvedValue([inGroup, outsideGroup]);
      relRepo.find.mockResolvedValue([makeRelationship()]);
      accountRepo.findOne.mockResolvedValue({ id: 'acct-rev' });

      const result = await service.generateEliminationEntries(
        TENANT,
        { periodEnd: '2026-01-31', groupId: 'grp-1' },
        'user-1',
      );

      expect(result.eliminatedCount).toBe(1);
      expect(result.totalEliminated).toBe(2000);
    });

    it('throws when groupId references a nonexistent group', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      await expect(
        service.generateEliminationEntries(
          TENANT,
          { periodEnd: '2026-01-31', groupId: 'bad-group' },
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('marks eliminated transactions as ELIMINATED', async () => {
      const txn = makeTxn({ totalAmount: 750, transactionDate: '2026-01-05' });
      txnRepo.find.mockResolvedValue([txn]);
      relRepo.find.mockResolvedValue([]);
      accountRepo.findOne.mockResolvedValue({ id: 'acct-rev' });

      await service.generateEliminationEntries(
        TENANT,
        { periodEnd: '2026-01-31' },
        'user-1',
      );

      expect(txnRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ status: IcTransactionStatus.ELIMINATED }),
        ]),
      );
    });
  });
});
