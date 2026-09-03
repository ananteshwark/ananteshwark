import { PutawayService } from './putaway.service';
import { PickingService } from './picking.service';
import { PutawayRuleType } from './entities/putaway-rule.entity';
import { WaveStatus, PickStrategy } from './entities/pick-wave.entity';
import { TaskStatus, TaskType } from './entities/warehouse-task.entity';

const mockRepo = () => ({
  create: jest.fn((v) => v),
  save: jest.fn((v) => Promise.resolve(v)),
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  remove: jest.fn().mockResolvedValue(undefined),
  createQueryBuilder: jest.fn(),
});

const qb = (result: any) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(result),
  getCount: jest.fn().mockResolvedValue(0),
  getRawOne: jest.fn().mockResolvedValue({ total: 0 }),
});

// ─── PutawayService ───────────────────────────────────────────────────────────

describe('PutawayService', () => {
  let service: PutawayService;
  let ruleRepo: any;
  let binRepo: any;
  let binStockRepo: any;

  beforeEach(() => {
    ruleRepo = mockRepo();
    binRepo = mockRepo();
    binStockRepo = mockRepo();
    service = new PutawayService(ruleRepo, binRepo, binStockRepo);
  });

  it('createRule saves with tenantId', async () => {
    ruleRepo.save.mockResolvedValue({ id: 'r1', tenantId: 't1', name: 'R' });
    const result = await service.createRule('t1', { name: 'R', warehouseId: 'w1', ruleType: PutawayRuleType.CONSOLIDATE, priority: 10 });
    expect(ruleRepo.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', name: 'R' }));
    expect(result).toMatchObject({ id: 'r1' });
  });

  it('listRules filters by warehouseId when provided', async () => {
    ruleRepo.find.mockResolvedValue([]);
    await service.listRules('t1', 'w1');
    expect(ruleRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 't1', warehouseId: 'w1' } }));
  });

  it('deleteRule throws when not found', async () => {
    ruleRepo.findOne.mockResolvedValue(null);
    await expect(service.deleteRule('t1', 'bad-id')).rejects.toThrow('not found');
  });

  describe('suggestPutaway', () => {
    it('FIXED_BIN rule returns the configured bin', async () => {
      ruleRepo.find.mockResolvedValue([{
        id: 'rule1', ruleType: PutawayRuleType.FIXED_BIN, destBinId: 'bin1',
        itemId: null, itemCategoryId: null, isActive: true, name: 'Fixed',
      }]);
      binRepo.findOne.mockResolvedValue({ id: 'bin1', code: 'A-01', zone: 'A', aisle: '1', rack: null, warehouseId: 'w1', isActive: true });
      binStockRepo.findOne.mockResolvedValue(null);

      const result = await service.suggestPutaway('t1', 'w1', 'item1', null, 10);
      expect(result).toHaveLength(1);
      expect(result[0].binCode).toBe('A-01');
      expect(result[0].reason).toContain('Fixed bin');
    });

    it('ITEM_ZONE rule returns bins in the correct zone', async () => {
      ruleRepo.find.mockResolvedValue([{
        id: 'rule2', ruleType: PutawayRuleType.ITEM_ZONE, destZone: 'COLD',
        itemId: 'item1', itemCategoryId: null, isActive: true, name: 'Cold zone',
      }]);
      binRepo.find.mockResolvedValue([
        { id: 'bin2', code: 'C-01', zone: 'COLD', aisle: '1', rack: null, warehouseId: 'w1', isActive: true },
        { id: 'bin3', code: 'C-02', zone: 'COLD', aisle: '1', rack: null, warehouseId: 'w1', isActive: true },
      ]);
      binRepo.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve({ id: where.id, code: where.id === 'bin2' ? 'C-01' : 'C-02', zone: 'COLD', aisle: '1', rack: null, warehouseId: 'w1', isActive: true }),
      );
      binStockRepo.findOne.mockResolvedValue(null);

      const result = await service.suggestPutaway('t1', 'w1', 'item1', null, 5);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].zone).toBe('COLD');
    });

    it('CATEGORY_ZONE rule matches on itemCategoryId', async () => {
      ruleRepo.find.mockResolvedValue([{
        id: 'rule3', ruleType: PutawayRuleType.CATEGORY_ZONE, destZone: 'DRY',
        itemId: null, itemCategoryId: 'cat1', isActive: true, name: 'Dry goods',
      }]);
      binRepo.find.mockResolvedValue([
        { id: 'bin4', code: 'D-01', zone: 'DRY', aisle: '2', rack: null, warehouseId: 'w1', isActive: true },
      ]);
      binRepo.findOne.mockResolvedValue({ id: 'bin4', code: 'D-01', zone: 'DRY', aisle: '2', rack: null, warehouseId: 'w1', isActive: true });
      binStockRepo.findOne.mockResolvedValue(null);

      const result = await service.suggestPutaway('t1', 'w1', 'itemX', 'cat1', 5);
      expect(result.length).toBe(1);
      expect(result[0].reason).toContain('Zone rule (DRY)');
    });

    it('CONSOLIDATE rule skips rule when no existing stock', async () => {
      ruleRepo.find.mockResolvedValue([{
        id: 'rule4', ruleType: PutawayRuleType.CONSOLIDATE,
        itemId: null, itemCategoryId: null, isActive: true, name: 'Consolidate',
      }]);
      binStockRepo.createQueryBuilder = jest.fn().mockReturnValue(qb([]));
      binRepo.find.mockResolvedValue([
        { id: 'bin5', code: 'E-01', zone: null, aisle: null, rack: null, warehouseId: 'w1', isActive: true },
      ]);
      binRepo.findOne.mockResolvedValue({ id: 'bin5', code: 'E-01', zone: null, aisle: null, rack: null, warehouseId: 'w1', isActive: true });
      binStockRepo.findOne.mockResolvedValue(null);

      const result = await service.suggestPutaway('t1', 'w1', 'newItem', null, 1);
      // Falls through to fallback default
      expect(result).toBeDefined();
    });

    it('NEAREST_EMPTY skips bins with existing stock', async () => {
      ruleRepo.find.mockResolvedValue([{
        id: 'rule5', ruleType: PutawayRuleType.NEAREST_EMPTY,
        itemId: null, itemCategoryId: null, isActive: true, name: 'Empty',
      }]);
      // binA has stock (50), binB is empty — NEAREST_EMPTY should suggest binB
      let stockCallCount = 0;
      const qbWithStock = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockImplementation(() => {
          stockCallCount++;
          return Promise.resolve({ total: stockCallCount === 1 ? 50 : 0 });
        }),
      };
      binStockRepo.createQueryBuilder = jest.fn().mockReturnValue(qbWithStock);
      binRepo.find.mockResolvedValue([
        { id: 'binA', code: 'A-01', zone: 'A', aisle: '1', rack: null, warehouseId: 'w1', isActive: true },
        { id: 'binB', code: 'B-01', zone: 'B', aisle: '1', rack: null, warehouseId: 'w1', isActive: true },
      ]);
      binRepo.findOne.mockImplementation(({ where }: any) => {
        if (where.id === 'binB') return Promise.resolve({ id: 'binB', code: 'B-01', zone: 'B', aisle: '1', rack: null, warehouseId: 'w1', isActive: true });
        return Promise.resolve(null);
      });
      binStockRepo.findOne.mockResolvedValue(null);

      const result = await service.suggestPutaway('t1', 'w1', 'item99', null, 5);
      const emptySuggestion = result.find(r => r.binCode === 'B-01');
      expect(emptySuggestion).toBeDefined();
    });

    it('returns fallback suggestions when no rules match', async () => {
      ruleRepo.find.mockResolvedValue([]);
      binStockRepo.createQueryBuilder = jest.fn().mockReturnValue(qb([]));
      binRepo.find.mockResolvedValue([
        { id: 'binZ', code: 'Z-01', zone: null, aisle: null, rack: null, warehouseId: 'w1', isActive: true },
      ]);
      binRepo.findOne.mockResolvedValue({ id: 'binZ', code: 'Z-01', zone: null, aisle: null, rack: null, warehouseId: 'w1', isActive: true });
      binStockRepo.findOne.mockResolvedValue(null);

      const result = await service.suggestPutaway('t1', 'w1', 'item_new', null, 5);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].reason).toContain('default');
    });
  });
});

// ─── PickingService ───────────────────────────────────────────────────────────

describe('PickingService', () => {
  let service: PickingService;
  let waveRepo: any;
  let taskRepo: any;
  let binStockRepo: any;
  let binRepo: any;
  let lotRepo: any;

  beforeEach(() => {
    waveRepo = mockRepo();
    taskRepo = mockRepo();
    binStockRepo = mockRepo();
    binRepo = mockRepo();
    lotRepo = mockRepo();
    const sequence: any = {
      next: jest.fn().mockResolvedValue(1),
      formatted: jest.fn((_t: string, _k: string, prefix: string, pad = 6) => Promise.resolve(`${prefix}${String(1).padStart(pad, '0')}`)),
    };
    service = new PickingService(waveRepo, taskRepo, binStockRepo, binRepo, lotRepo, sequence);
  });

  // ─── Wave tests ───────────────────────────────────────────────────

  it('createWave generates a wave number from the atomic sequence', async () => {
    waveRepo.save.mockImplementation((v: any) => Promise.resolve({ ...v, id: 'w1' }));
    const wave = await service.createWave('t1', { warehouseId: 'wh1', pickStrategy: PickStrategy.FEFO, priority: 50 });
    expect(wave.waveNumber).toBe('WAVE-000001');
  });

  it('releaseWave sets tasks to IN_PROGRESS', async () => {
    waveRepo.findOne.mockResolvedValue({ id: 'w1', status: WaveStatus.OPEN, tenantId: 't1' });
    const openTask = { id: 't1', status: TaskStatus.OPEN, waveId: 'w1' };
    taskRepo.find.mockResolvedValue([openTask]);
    taskRepo.save.mockImplementation((v: any) => Promise.resolve(v));
    waveRepo.save.mockImplementation((v: any) => Promise.resolve({ ...v, releasedAt: new Date() }));

    await service.releaseWave('t1', 'w1');
    expect(taskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: TaskStatus.IN_PROGRESS }));
  });

  it('releaseWave throws when wave is not OPEN', async () => {
    waveRepo.findOne.mockResolvedValue({ id: 'w1', status: WaveStatus.RELEASED, tenantId: 't1' });
    await expect(service.releaseWave('t1', 'w1')).rejects.toThrow('OPEN');
  });

  it('completeWave throws when tasks are still open', async () => {
    waveRepo.findOne.mockResolvedValue({ id: 'w1', status: WaveStatus.RELEASED, tenantId: 't1' });
    const qbWithCount = { ...qb([]), getCount: jest.fn().mockResolvedValue(2) };
    taskRepo.createQueryBuilder = jest.fn().mockReturnValue(qbWithCount);

    await expect(service.completeWave('t1', 'w1')).rejects.toThrow('still open');
  });

  it('completeWave succeeds when all tasks are done', async () => {
    waveRepo.findOne.mockResolvedValue({ id: 'w1', status: WaveStatus.RELEASED, tenantId: 't1' });
    const qbAllDone = { ...qb([]), getCount: jest.fn().mockResolvedValue(0) };
    taskRepo.createQueryBuilder = jest.fn().mockReturnValue(qbAllDone);
    waveRepo.save.mockImplementation((v: any) => Promise.resolve({ ...v, completedAt: new Date() }));

    const result = await service.completeWave('t1', 'w1');
    expect(result.status).toBe(WaveStatus.COMPLETED);
  });

  it('addTasksToWave rejects non-PICK tasks', async () => {
    waveRepo.findOne.mockResolvedValue({ id: 'w1', status: WaveStatus.OPEN });
    taskRepo.findOne.mockResolvedValue({ id: 't1', taskType: TaskType.PUTAWAY });
    await expect(service.addTasksToWave('t1', 'w1', ['t1'])).rejects.toThrow('not a PICK task');
  });

  it('getWave throws when not found', async () => {
    waveRepo.findOne.mockResolvedValue(null);
    await expect(service.getWave('t1', 'bad')).rejects.toThrow('not found');
  });

  // ─── suggestPicks tests ───────────────────────────────────────────

  const makeStocks = () => [
    { id: 's1', binLocationId: 'bin1', itemId: 'item1', warehouseId: 'wh1', lotSerialId: 'lot1', qty: 50, reservedQty: 0, tenantId: 't1' },
    { id: 's2', binLocationId: 'bin2', itemId: 'item1', warehouseId: 'wh1', lotSerialId: 'lot2', qty: 30, reservedQty: 0, tenantId: 't1' },
    { id: 's3', binLocationId: 'bin3', itemId: 'item1', warehouseId: 'wh1', lotSerialId: 'lot3', qty: 20, reservedQty: 0, tenantId: 't1' },
  ];

  const makeBin = (id: string, zone: string, aisle: string) => ({ id, code: `${zone}-${aisle}`, zone, aisle, rack: null });

  const makeLot = (id: string, created: string, expiry?: string) => ({
    id, lotNumber: `LOT-${id.slice(0, 4)}`, expiryDate: expiry ?? null, createdAt: new Date(created),
  });

  it('suggestPicks returns empty when no stock', async () => {
    binStockRepo.find.mockResolvedValue([]);
    const result = await service.suggestPicks('t1', 'wh1', 'item1', 10, PickStrategy.FIFO);
    expect(result).toHaveLength(0);
  });

  it('FIFO sorts by lot creation date ascending', async () => {
    binStockRepo.find.mockResolvedValue(makeStocks());
    binRepo.findOne.mockImplementation(({ where }: any) => Promise.resolve(makeBin(where.id, 'A', where.id.slice(-1))));
    lotRepo.findOne.mockImplementation(({ where }: any) => {
      const dates: Record<string, string> = { lot1: '2024-06-01', lot2: '2024-01-01', lot3: '2024-03-01' };
      return Promise.resolve(makeLot(where.id, dates[where.id] ?? '2024-01-01'));
    });

    const result = await service.suggestPicks('t1', 'wh1', 'item1', 200, PickStrategy.FIFO);
    expect(result[0].lotSerialId).toBe('lot2'); // earliest created
    expect(result[1].lotSerialId).toBe('lot3');
    expect(result[2].lotSerialId).toBe('lot1'); // latest created
  });

  it('FEFO sorts by expiry date ascending, nulls last', async () => {
    binStockRepo.find.mockResolvedValue(makeStocks());
    binRepo.findOne.mockImplementation(({ where }: any) => Promise.resolve(makeBin(where.id, 'A', '1')));
    lotRepo.findOne.mockImplementation(({ where }: any) => {
      const expiries: Record<string, string | null> = { lot1: '2025-12-31', lot2: '2025-06-30', lot3: null };
      return Promise.resolve(makeLot(where.id, '2024-01-01', expiries[where.id] ?? undefined));
    });

    const result = await service.suggestPicks('t1', 'wh1', 'item1', 200, PickStrategy.FEFO);
    expect(result[0].lotSerialId).toBe('lot2'); // earliest expiry
    expect(result[1].lotSerialId).toBe('lot1');
    expect(result[2].lotSerialId).toBe('lot3'); // null expiry goes last
  });

  it('ZONE sorts by zone then aisle alphabetically', async () => {
    binStockRepo.find.mockResolvedValue(makeStocks());
    binRepo.findOne.mockImplementation(({ where }: any) => {
      const bins: Record<string, any> = {
        bin1: makeBin('bin1', 'C', '1'),
        bin2: makeBin('bin2', 'A', '2'),
        bin3: makeBin('bin3', 'B', '1'),
      };
      return Promise.resolve(bins[where.id]);
    });
    lotRepo.findOne.mockResolvedValue(null);

    const result = await service.suggestPicks('t1', 'wh1', 'item1', 200, PickStrategy.ZONE);
    expect(result[0].zone).toBe('A');
    expect(result[1].zone).toBe('B');
    expect(result[2].zone).toBe('C');
  });

  it('suggestPicks accumulates qty and sets sequence numbers', async () => {
    binStockRepo.find.mockResolvedValue(makeStocks()); // 50 + 30 + 20 = 100 total
    binRepo.findOne.mockImplementation(({ where }: any) => Promise.resolve(makeBin(where.id, 'A', '1')));
    lotRepo.findOne.mockResolvedValue(null);

    const result = await service.suggestPicks('t1', 'wh1', 'item1', 65, PickStrategy.FEFO);
    const totalSuggested = result.reduce((s, p) => s + p.suggestedQty, 0);
    expect(totalSuggested).toBe(65);
    expect(result[0].sequence).toBe(1);
    expect(result[result.length - 1].sequence).toBe(result.length);
  });

  it('suggestPicks respects reservedQty when computing available', async () => {
    binStockRepo.find.mockResolvedValue([
      { id: 's1', binLocationId: 'bin1', itemId: 'item1', warehouseId: 'wh1', lotSerialId: null, qty: 100, reservedQty: 90, tenantId: 't1' },
    ]);
    binRepo.findOne.mockResolvedValue(makeBin('bin1', 'A', '1'));
    lotRepo.findOne.mockResolvedValue(null);

    const result = await service.suggestPicks('t1', 'wh1', 'item1', 50, PickStrategy.FIFO);
    expect(result[0].availableQty).toBe(10); // 100 - 90
    expect(result[0].suggestedQty).toBe(10); // only 10 available out of 50 requested
  });
});
