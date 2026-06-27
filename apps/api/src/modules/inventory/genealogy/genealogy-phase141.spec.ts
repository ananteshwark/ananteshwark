import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GenealogyService } from './genealogy.service';
import { LotGenealogy, GenealogyRelation } from './entities/lot-genealogy.entity';
import { LotSerial } from '../entities/lot-serial.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('GenealogyService — Phase 141-144', () => {
  let service: GenealogyService;
  let genRepo: any;
  let lotRepo: any;

  beforeEach(async () => {
    genRepo = mockRepo();
    lotRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        GenealogyService,
        { provide: getRepositoryToken(LotGenealogy), useValue: genRepo },
        { provide: getRepositoryToken(LotSerial), useValue: lotRepo },
      ],
    }).compile();
    service = module.get(GenealogyService);
  });

  // ─── Ph-141: capture ──────────────────────────────────────────────

  it('recordEdge — happy path', async () => {
    const e = await service.recordEdge('t1', { parentLotId: 'fg1', childLotId: 'rm1', quantityUsed: 5, eventDate: '2026-06-01' });
    expect(genRepo.create).toHaveBeenCalledWith(expect.objectContaining({ parentLotId: 'fg1', childLotId: 'rm1', relation: GenealogyRelation.CONSUMED }));
    expect(e.id).toBe('gen-1');
  });

  it('recordEdge — rejects self-parent', async () => {
    await expect(service.recordEdge('t1', { parentLotId: 'x', childLotId: 'x', eventDate: '2026-06-01' })).rejects.toThrow(BadRequestException);
  });

  it('recordProduction — creates an edge per component', async () => {
    const edges = await service.recordProduction('t1', {
      parentLotId: 'fg1', eventDate: '2026-06-01',
      components: [{ childLotId: 'rm1', quantityUsed: 3 }, { childLotId: 'rm2', quantityUsed: 7 }],
    });
    expect(edges).toHaveLength(2);
    expect(genRepo.save).toHaveBeenCalledTimes(2);
  });

  it('recordProduction — rejects empty components', async () => {
    await expect(service.recordProduction('t1', { parentLotId: 'fg1', components: [], eventDate: '2026-06-01' })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-143: backward trace ───────────────────────────────────────

  it('backwardTrace — builds component tree', async () => {
    lotRepo.findOne.mockResolvedValue({ id: 'fg1', lotNumber: 'FG-1', itemId: 'item-fg' });
    // fg1 → [rm1, rm2]; rm1 → [raw0]
    genRepo.find.mockImplementation(({ where }: any) => {
      if (where.parentLotId === 'fg1') return Promise.resolve([
        { childLotId: 'rm1', relation: 'CONSUMED', quantityUsed: 3, eventDate: '2026-06-01' },
        { childLotId: 'rm2', relation: 'CONSUMED', quantityUsed: 7, eventDate: '2026-06-01' },
      ]);
      if (where.parentLotId === 'rm1') return Promise.resolve([{ childLotId: 'raw0', relation: 'RECEIVED', quantityUsed: 3, eventDate: '2026-05-01' }]);
      return Promise.resolve([]);
    });
    lotRepo.find.mockImplementation(({ where }: any) => Promise.resolve((where.id?._value ?? []).map((id: string) => ({ id, lotNumber: id.toUpperCase(), itemId: `item-${id}` }))));

    const tree = await service.backwardTrace('t1', 'fg1');
    expect(tree.lotId).toBe('fg1');
    expect(tree.children).toHaveLength(2);
    const rm1 = tree.children.find((c: any) => c.lotId === 'rm1');
    expect(rm1.children).toHaveLength(1);
    expect(rm1.children[0].lotId).toBe('raw0');
  });

  it('backwardTrace — throws on missing lot', async () => {
    lotRepo.findOne.mockResolvedValue(null);
    await expect(service.backwardTrace('t1', 'nope')).rejects.toThrow(NotFoundException);
  });

  // ─── Ph-142: forward trace ────────────────────────────────────────

  it('forwardTrace — walks child → parents', async () => {
    lotRepo.findOne.mockResolvedValue({ id: 'rm1', lotNumber: 'RM-1' });
    genRepo.find.mockImplementation(({ where }: any) => {
      if (where.childLotId === 'rm1') return Promise.resolve([{ parentLotId: 'fg1', relation: 'CONSUMED', quantityUsed: 3, eventDate: '2026-06-01' }]);
      return Promise.resolve([]);
    });
    lotRepo.find.mockResolvedValue([{ id: 'fg1', lotNumber: 'FG-1', itemId: 'item-fg' }]);
    const tree = await service.forwardTrace('t1', 'rm1');
    expect(tree.parents).toHaveLength(1);
    expect(tree.parents[0].lotId).toBe('fg1');
  });

  // ─── Ph-144: recall impact ────────────────────────────────────────

  it('recallImpact — collects downstream and finished-good lots', async () => {
    lotRepo.findOne.mockResolvedValue({ id: 'rm1', lotNumber: 'RM-1' });
    // rm1 → fg1 (intermediate) → fgFinal (top-level)
    genRepo.find.mockImplementation(({ where }: any) => {
      const ids = where.childLotId?._value ?? (where.childLotId ? [where.childLotId] : []);
      if (ids.includes('rm1')) return Promise.resolve([{ parentLotId: 'fg1', childLotId: 'rm1' }]);
      if (ids.includes('fg1')) return Promise.resolve([{ parentLotId: 'fgFinal', childLotId: 'fg1' }]);
      return Promise.resolve([]);
    });
    lotRepo.find.mockImplementation(({ where }: any) => Promise.resolve((where.id?._value ?? []).map((id: string) => ({ id, lotNumber: id }))));

    const impact = await service.recallImpact('t1', 'rm1');
    expect(impact.affectedLotCount).toBe(2); // fg1 + fgFinal
    const fgIds = impact.finishedGoodLots.map((l: any) => l.lotId);
    expect(fgIds).toContain('fgFinal');
    expect(fgIds).not.toContain('fg1'); // fg1 has a parent → not top-level
  });

  it('recallImpact — throws on missing lot', async () => {
    lotRepo.findOne.mockResolvedValue(null);
    await expect(service.recallImpact('t1', 'nope')).rejects.toThrow(NotFoundException);
  });
});
