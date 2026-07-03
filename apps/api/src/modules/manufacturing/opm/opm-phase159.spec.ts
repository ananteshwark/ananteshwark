import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OpmService } from './opm.service';
import { SequenceService } from '../../../common/sequence/sequence.service';
import { Formula, FormulaDetail, FormulaStatus, FormulaLineType } from './entities/formula.entity';

const seqMock = () => ({
  next: jest.fn().mockResolvedValue(1),
  formatted: jest.fn((_t: string, _k: string, prefix: string, pad = 6) => Promise.resolve(`${prefix}${String(1).padStart(pad, '0')}`)),
});
import { Batch, BatchStatus } from './entities/batch.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('OpmService — Phase 159-162', () => {
  let service: OpmService;
  let formulaRepo: any, detailRepo: any, batchRepo: any;

  beforeEach(async () => {
    formulaRepo = mockRepo(); detailRepo = mockRepo(); batchRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        OpmService,
        { provide: SequenceService, useValue: seqMock() },
        { provide: getRepositoryToken(Formula), useValue: formulaRepo },
        { provide: getRepositoryToken(FormulaDetail), useValue: detailRepo },
        { provide: getRepositoryToken(Batch), useValue: batchRepo },
      ],
    }).compile();
    service = module.get(OpmService);
  });

  // ─── Ph-159 ───────────────────────────────────────────────────────

  it('createFormula — rejects duplicate', async () => {
    formulaRepo.findOne.mockResolvedValue({ id: 'f1' });
    await expect(service.createFormula('t1', { code: 'F1', name: 'x', productItemId: 'p1', outputQuantity: 100 })).rejects.toThrow(BadRequestException);
  });

  it('approveFormula — requires at least one ingredient', async () => {
    formulaRepo.findOne.mockResolvedValue({ id: 'f1', status: FormulaStatus.DRAFT });
    detailRepo.find.mockResolvedValue([{ lineType: FormulaLineType.BYPRODUCT }]);
    await expect(service.approveFormula('t1', 'f1')).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-160: scaling ──────────────────────────────────────────────

  it('scaleFormula — scales ingredients linearly + grosses for scrap', () => {
    const formula = { productItemId: 'prod', outputQuantity: 100, outputUom: 'KG', yieldPct: 100 } as Formula;
    const details = [
      { lineType: FormulaLineType.INGREDIENT, itemId: 'a', quantity: 60, uom: 'KG', scrapPct: 0 },
      { lineType: FormulaLineType.INGREDIENT, itemId: 'b', quantity: 40, uom: 'KG', scrapPct: 10 },
      { lineType: FormulaLineType.BYPRODUCT, itemId: 'waste', quantity: 5, uom: 'KG', scrapPct: 0 },
    ] as FormulaDetail[];
    const r = service.scaleFormula(formula, details, 200); // 2x
    expect(r.scaleFactor).toBe(2);
    const a = r.ingredients.find((i) => i.itemId === 'a');
    const b = r.ingredients.find((i) => i.itemId === 'b');
    expect(a!.quantity).toBe(120); // 60*2
    expect(b!.quantity).toBe(88); // 40*2 * 1.10
    // product output + byproduct in outputs
    expect(r.outputs.find((o) => o.lineType === 'PRODUCT')!.quantity).toBe(200);
    expect(r.outputs.find((o) => o.itemId === 'waste')!.quantity).toBe(10);
  });

  it('scaleFormula — yield % reduces product output', () => {
    const formula = { productItemId: 'prod', outputQuantity: 100, outputUom: 'KG', yieldPct: 90 } as Formula;
    const r = service.scaleFormula(formula, [], 100);
    expect(r.outputs.find((o) => o.lineType === 'PRODUCT')!.quantity).toBe(90);
  });

  it('createBatch — requires approved formula', async () => {
    formulaRepo.findOne.mockResolvedValue({ id: 'f1', status: FormulaStatus.DRAFT, outputQuantity: 100, productItemId: 'p1', outputUom: 'KG', yieldPct: 100 });
    detailRepo.find.mockResolvedValue([]);
    await expect(service.createBatch('t1', { formulaId: 'f1', targetOutput: 200 })).rejects.toThrow(BadRequestException);
  });

  it('createBatch — builds scaled batch from approved formula', async () => {
    formulaRepo.findOne.mockResolvedValue({ id: 'f1', status: FormulaStatus.APPROVED, outputQuantity: 100, productItemId: 'p1', outputUom: 'KG', yieldPct: 100 });
    detailRepo.find.mockResolvedValue([{ lineType: FormulaLineType.INGREDIENT, itemId: 'a', quantity: 50, uom: 'KG', scrapPct: 0 }]);
    batchRepo.count.mockResolvedValue(0);
    const batch = await service.createBatch('t1', { formulaId: 'f1', targetOutput: 300 });
    expect(batchRepo.create).toHaveBeenCalledWith(expect.objectContaining({ scaleFactor: 3, batchNumber: 'BATCH-000001' }));
    expect(batch.id).toBe('gen-1');
  });

  // ─── Ph-161/162: lifecycle + lab ──────────────────────────────────

  it('completeBatch — moves IN_PROGRESS → LAB_HOLD', async () => {
    batchRepo.findOne.mockResolvedValue({ id: 'b1', status: BatchStatus.IN_PROGRESS, batchNumber: 'BATCH-1' });
    batchRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const b = await service.completeBatch('t1', 'b1', { actualOutput: 295 });
    expect(b.status).toBe(BatchStatus.LAB_HOLD);
    expect(b.actualOutput).toBe(295);
    expect(b.completedAt).toBeInstanceOf(Date);
  });

  it('labResult — PASS releases batch to stock', async () => {
    batchRepo.findOne.mockResolvedValue({ id: 'b1', status: BatchStatus.LAB_HOLD });
    batchRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const b = await service.labResult('t1', 'b1', { result: 'PASS' });
    expect(b.status).toBe(BatchStatus.RELEASED);
    expect(b.releasedAt).toBeInstanceOf(Date);
  });

  it('labResult — FAIL rejects batch', async () => {
    batchRepo.findOne.mockResolvedValue({ id: 'b1', status: BatchStatus.LAB_HOLD });
    batchRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const b = await service.labResult('t1', 'b1', { result: 'FAIL', note: 'contamination' });
    expect(b.status).toBe(BatchStatus.REJECTED);
  });

  it('labResult — rejects when not awaiting lab', async () => {
    batchRepo.findOne.mockResolvedValue({ id: 'b1', status: BatchStatus.IN_PROGRESS });
    await expect(service.labResult('t1', 'b1', { result: 'PASS' })).rejects.toThrow(BadRequestException);
  });

  it('startBatch — rejects non-planned', async () => {
    batchRepo.findOne.mockResolvedValue({ id: 'b1', status: BatchStatus.COMPLETED });
    await expect(service.startBatch('t1', 'b1')).rejects.toThrow(BadRequestException);
  });

  it('getBatch — throws when missing', async () => {
    batchRepo.findOne.mockResolvedValue(null);
    await expect(service.getBatch('t1', 'nope')).rejects.toThrow(NotFoundException);
  });
});
