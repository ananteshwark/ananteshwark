import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SourceDeterminationService } from './source-determination.service';
import { SourceList } from './entities/source-list.entity';
import { QuotaArrangement, QuotaArrangementStatus } from './entities/quota-arrangement.entity';

const mockRepo = () => ({
  create: jest.fn((d) => d),
  save: jest.fn(async (d) => ({ id: 'new-id', ...d })),
  findOne: jest.fn(),
  find: jest.fn(async () => []),
  remove: jest.fn(async (e) => e),
  createQueryBuilder: jest.fn(),
  update: jest.fn(),
});

const makeQb = (results: any[]) => {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(results),
  };
  return qb;
};

const TENANT = 'tenant-1';
const ITEM_ID = 'item-uuid-1';
const VENDOR_A = 'vendor-a';
const VENDOR_B = 'vendor-b';
const VENDOR_C = 'vendor-c';

const makeSourceList = (overrides: Partial<SourceList> = {}): SourceList => ({
  id: 'sl-1',
  tenantId: TENANT,
  itemId: ITEM_ID,
  itemCode: 'MAT-001',
  itemDescription: 'Raw Material A',
  vendorId: VENDOR_A,
  vendorName: 'Vendor Alpha',
  plant: null,
  validFrom: '2025-01-01',
  validTo: null,
  priority: 1,
  isFixed: false,
  isBlocked: false,
  infoRecordId: null,
  outlineAgreementId: null,
  minOrderQty: null,
  currency: 'INR',
  leadTimeDays: 5,
  notes: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeQuotaArrangement = (overrides: any = {}): QuotaArrangement => ({
  id: 'qa-1',
  tenantId: TENANT,
  itemId: ITEM_ID,
  itemCode: 'MAT-001',
  itemDescription: 'Raw Material A',
  validFrom: '2025-01-01',
  validTo: null,
  status: QuotaArrangementStatus.ACTIVE,
  items: [
    { vendorId: VENDOR_A, vendorName: 'Vendor Alpha', quotaPercentage: 60, allocatedQty: 0, priority: 1 },
    { vendorId: VENDOR_B, vendorName: 'Vendor Beta', quotaPercentage: 40, allocatedQty: 0, priority: 2 },
  ],
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('SourceDeterminationService', () => {
  let service: SourceDeterminationService;
  let slRepo: ReturnType<typeof mockRepo>;
  let qaRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    slRepo = mockRepo();
    qaRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SourceDeterminationService,
        { provide: getRepositoryToken(SourceList), useValue: slRepo },
        { provide: getRepositoryToken(QuotaArrangement), useValue: qaRepo },
      ],
    }).compile();

    service = module.get(SourceDeterminationService);
  });

  // ─── Source List CRUD ────────────────────────────────────────────────────────

  describe('createSourceList', () => {
    it('creates entry with defaults', async () => {
      const dto = {
        itemId: ITEM_ID,
        vendorId: VENDOR_A,
        validFrom: '2025-01-01',
      };
      const result = await service.createSourceList(TENANT, dto as any);
      expect(slRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT, isFixed: false, isBlocked: false, priority: 1 }),
      );
      expect(result).toHaveProperty('id');
    });

    it('creates fixed source list entry', async () => {
      const dto = { itemId: ITEM_ID, vendorId: VENDOR_A, validFrom: '2025-01-01', isFixed: true };
      await service.createSourceList(TENANT, dto as any);
      expect(slRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isFixed: true }));
    });
  });

  describe('updateSourceList', () => {
    it('throws if not found', async () => {
      slRepo.findOne.mockResolvedValue(null);
      await expect(service.updateSourceList(TENANT, 'bad-id', {})).rejects.toThrow(NotFoundException);
    });

    it('blocks vendor in source list', async () => {
      const entry = makeSourceList();
      slRepo.findOne.mockResolvedValue(entry);
      await service.updateSourceList(TENANT, 'sl-1', { isBlocked: true });
      expect(slRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isBlocked: true }));
    });
  });

  describe('findSourceLists', () => {
    it('applies all filters via query builder', async () => {
      const qb = makeQb([makeSourceList()]);
      slRepo.createQueryBuilder.mockReturnValue(qb);
      const result = await service.findSourceLists(TENANT, { itemId: ITEM_ID, activeOnly: true, asOf: '2025-06-01' });
      expect(qb.andWhere).toHaveBeenCalledWith('sl.item_id = :itemId', { itemId: ITEM_ID });
      expect(result).toHaveLength(1);
    });
  });

  describe('deleteSourceList', () => {
    it('throws if not found', async () => {
      slRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteSourceList(TENANT, 'bad')).rejects.toThrow(NotFoundException);
    });

    it('removes the entry', async () => {
      const entry = makeSourceList();
      slRepo.findOne.mockResolvedValue(entry);
      await service.deleteSourceList(TENANT, 'sl-1');
      expect(slRepo.remove).toHaveBeenCalledWith(entry);
    });
  });

  // ─── Quota Arrangement CRUD ──────────────────────────────────────────────────

  describe('createQuotaArrangement', () => {
    it('creates with valid quota items', async () => {
      const dto = {
        itemId: ITEM_ID,
        validFrom: '2025-01-01',
        items: [
          { vendorId: VENDOR_A, vendorName: 'A', quotaPercentage: 60 },
          { vendorId: VENDOR_B, vendorName: 'B', quotaPercentage: 40 },
        ],
      };
      const result = await service.createQuotaArrangement(TENANT, dto as any);
      expect(qaRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ vendorId: VENDOR_A, allocatedQty: 0 }),
          ]),
        }),
      );
      expect(result).toHaveProperty('id');
    });

    it('rejects if quota items do not sum to 100', async () => {
      const dto = {
        itemId: ITEM_ID,
        validFrom: '2025-01-01',
        items: [
          { vendorId: VENDOR_A, vendorName: 'A', quotaPercentage: 60 },
          { vendorId: VENDOR_B, vendorName: 'B', quotaPercentage: 30 },
        ],
      };
      await expect(service.createQuotaArrangement(TENANT, dto as any)).rejects.toThrow(BadRequestException);
    });

    it('rejects quota items summing to 0', async () => {
      await expect(
        service.createQuotaArrangement(TENANT, {
          itemId: ITEM_ID,
          validFrom: '2025-01-01',
          items: [{ vendorId: VENDOR_A, vendorName: 'A', quotaPercentage: 50 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resetQuotaAllocations', () => {
    it('resets all allocated quantities to zero', async () => {
      const qa = makeQuotaArrangement({
        items: [
          { vendorId: VENDOR_A, vendorName: 'A', quotaPercentage: 60, allocatedQty: 300, priority: 1 },
          { vendorId: VENDOR_B, vendorName: 'B', quotaPercentage: 40, allocatedQty: 200, priority: 2 },
        ],
      });
      qaRepo.findOne.mockResolvedValue(qa);
      await service.resetQuotaAllocations(TENANT, 'qa-1');
      expect(qaRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ allocatedQty: 0 }),
          ]),
        }),
      );
    });
  });

  // ─── Source Determination Logic ──────────────────────────────────────────────

  describe('determineSource', () => {
    beforeEach(() => {
      // Default: no source lists, no quota
      slRepo.createQueryBuilder.mockReturnValue(makeQb([]));
      qaRepo.createQueryBuilder.mockReturnValue(makeQb([]));
    });

    it('returns empty proposals when no sources exist', async () => {
      const result = await service.determineSource(TENANT, ITEM_ID, 100);
      expect(result.proposals).toHaveLength(0);
      expect(result.recommended).toBeNull();
    });

    it('promotes fixed source list entry to rank 1', async () => {
      const fixed = makeSourceList({ isFixed: true, priority: 1 });
      const regular = makeSourceList({ id: 'sl-2', vendorId: VENDOR_B, isFixed: false, priority: 2 });
      slRepo.createQueryBuilder.mockReturnValue(makeQb([fixed, regular]));
      const result = await service.determineSource(TENANT, ITEM_ID, 100);
      expect(result.proposals[0].source).toBe('FIXED');
      expect(result.proposals[0].vendorId).toBe(VENDOR_A);
      expect(result.hasFixed).toBe(true);
      expect(result.recommended?.vendorId).toBe(VENDOR_A);
    });

    it('uses quota arrangement to propose vendor', async () => {
      slRepo.createQueryBuilder.mockReturnValue(makeQb([]));
      qaRepo.createQueryBuilder.mockReturnValue(makeQb([makeQuotaArrangement()]));
      const result = await service.determineSource(TENANT, ITEM_ID, 50);
      expect(result.proposals.some(p => p.source === 'QUOTA')).toBe(true);
      expect(result.hasQuota).toBe(true);
    });

    it('selects vendor with highest quota deficit when allocations differ', async () => {
      // VENDOR_B has received 80% of requests but target is 40% — it's over, VENDOR_A (60% target, 20% actual) should win
      const qa = makeQuotaArrangement({
        items: [
          { vendorId: VENDOR_A, vendorName: 'A', quotaPercentage: 60, allocatedQty: 100, priority: 1 },
          { vendorId: VENDOR_B, vendorName: 'B', quotaPercentage: 40, allocatedQty: 400, priority: 2 },
        ],
      });
      slRepo.createQueryBuilder.mockReturnValue(makeQb([]));
      qaRepo.createQueryBuilder.mockReturnValue(makeQb([qa]));
      const result = await service.determineSource(TENANT, ITEM_ID, 50);
      const quotaProposal = result.proposals.find(p => p.source === 'QUOTA');
      expect(quotaProposal?.vendorId).toBe(VENDOR_A);
    });

    it('excludes blocked vendors from quota', async () => {
      const blocked = makeSourceList({ vendorId: VENDOR_A, isBlocked: true });
      slRepo.createQueryBuilder.mockReturnValue(makeQb([blocked]));
      const qa = makeQuotaArrangement();
      qaRepo.createQueryBuilder.mockReturnValue(makeQb([qa]));
      const result = await service.determineSource(TENANT, ITEM_ID, 50);
      const quotaProposals = result.proposals.filter(p => p.source === 'QUOTA');
      expect(quotaProposals.every(p => p.vendorId !== VENDOR_A)).toBe(true);
    });

    it('marks blocked source list entries as isBlocked in proposals', async () => {
      const blocked = makeSourceList({ isBlocked: true, vendorId: VENDOR_A });
      slRepo.createQueryBuilder.mockReturnValue(makeQb([blocked]));
      const result = await service.determineSource(TENANT, ITEM_ID, 100);
      expect(result.proposals[0].isBlocked).toBe(true);
      expect(result.recommended).toBeNull();
    });

    it('deduplicates vendors already included from quota when building source list proposals', async () => {
      const sl = makeSourceList({ isFixed: false, vendorId: VENDOR_A });
      slRepo.createQueryBuilder.mockReturnValue(makeQb([sl]));
      const qa = makeQuotaArrangement({
        items: [
          { vendorId: VENDOR_A, vendorName: 'A', quotaPercentage: 100, allocatedQty: 0, priority: 1 },
        ],
      });
      qaRepo.createQueryBuilder.mockReturnValue(makeQb([qa]));
      const result = await service.determineSource(TENANT, ITEM_ID, 50);
      const vendorAProposals = result.proposals.filter(p => p.vendorId === VENDOR_A);
      expect(vendorAProposals).toHaveLength(1); // quota inclusion, not duplicated as SOURCE_LIST
    });
  });

  // ─── resolveForRequisitionLines ──────────────────────────────────────────────

  describe('resolveForRequisitionLines', () => {
    it('skips lines without itemId', async () => {
      slRepo.createQueryBuilder.mockReturnValue(makeQb([]));
      qaRepo.createQueryBuilder.mockReturnValue(makeQb([]));
      const lines = [{ id: 'line-1', itemId: null, quantity: 10 }];
      const result = await service.resolveForRequisitionLines(TENANT, lines as any);
      expect(result[0]).toEqual({ lineId: 'line-1', proposal: null });
    });

    it('resolves vendor for line with itemId', async () => {
      const fixed = makeSourceList({ isFixed: true });
      slRepo.createQueryBuilder.mockReturnValue(makeQb([fixed]));
      qaRepo.createQueryBuilder.mockReturnValue(makeQb([]));
      const lines = [{ id: 'line-1', itemId: ITEM_ID, quantity: 100 }];
      const result = await service.resolveForRequisitionLines(TENANT, lines as any);
      expect(result[0].proposal?.vendorId).toBe(VENDOR_A);
    });
  });

  // ─── recordQuotaAllocation ───────────────────────────────────────────────────

  describe('recordQuotaAllocation', () => {
    it('increments allocatedQty for the matched vendor', async () => {
      const qa = makeQuotaArrangement();
      qaRepo.findOne.mockResolvedValue(qa);
      await service.recordQuotaAllocation(TENANT, 'qa-1', VENDOR_A, 50);
      expect(qaRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ vendorId: VENDOR_A, allocatedQty: 50 }),
          ]),
        }),
      );
    });

    it('is a no-op when quota arrangement not found', async () => {
      qaRepo.findOne.mockResolvedValue(null);
      await expect(service.recordQuotaAllocation(TENANT, 'bad', VENDOR_A, 50)).resolves.toBeUndefined();
    });
  });
});
