import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Formula, FormulaDetail, FormulaStatus, FormulaLineType } from './entities/formula.entity';
import { Batch, BatchStatus } from './entities/batch.entity';

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

@Injectable()
export class OpmService {
  constructor(
    @InjectRepository(Formula) private readonly formulaRepo: Repository<Formula>,
    @InjectRepository(FormulaDetail) private readonly detailRepo: Repository<FormulaDetail>,
    @InjectRepository(Batch) private readonly batchRepo: Repository<Batch>,
  ) {}

  // ─── Ph-159: Formula / recipe ─────────────────────────────────────

  listFormulas(tenantId: string): Promise<Formula[]> {
    return this.formulaRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async getFormula(tenantId: string, id: string): Promise<{ formula: Formula; details: FormulaDetail[] }> {
    const formula = await this.formulaRepo.findOne({ where: { id, tenantId } });
    if (!formula) throw new NotFoundException(`Formula ${id} not found`);
    const details = await this.detailRepo.find({ where: { tenantId, formulaId: id } });
    return { formula, details };
  }

  async updateFormula(tenantId: string, id: string, dto: any): Promise<Formula> {
    const formula = await this.formulaRepo.findOne({ where: { id, tenantId } });
    if (!formula) throw new NotFoundException(`Formula ${id} not found`);
    const { tenantId: _t, id: _i, status: _s, ...rest } = dto ?? {};
    Object.assign(formula, rest);
    return this.formulaRepo.save(formula);
  }

  async createFormula(tenantId: string, data: {
    code: string; name: string; productItemId: string; outputQuantity: number; outputUom?: string; yieldPct?: number;
  }): Promise<Formula> {
    if (!data.code) throw new BadRequestException('code is required');
    if (!data.productItemId) throw new BadRequestException('productItemId is required');
    if (!data.outputQuantity || data.outputQuantity <= 0) throw new BadRequestException('outputQuantity must be > 0');
    const dup = await this.formulaRepo.findOne({ where: { tenantId, code: data.code } });
    if (dup) throw new BadRequestException(`Formula ${data.code} already exists`);
    const f = this.formulaRepo.create({
      tenantId, code: data.code, name: data.name, productItemId: data.productItemId,
      outputQuantity: data.outputQuantity, outputUom: data.outputUom ?? 'KG', yieldPct: data.yieldPct ?? 100,
      status: FormulaStatus.DRAFT, version: 'v1',
    } as any) as unknown as Formula;
    return (this.formulaRepo.save(f) as unknown) as Promise<Formula>;
  }

  async addDetail(tenantId: string, formulaId: string, data: {
    lineType?: FormulaLineType; itemId: string; quantity: number; uom?: string; scrapPct?: number;
  }): Promise<FormulaDetail> {
    const formula = await this.formulaRepo.findOne({ where: { id: formulaId, tenantId } });
    if (!formula) throw new NotFoundException(`Formula ${formulaId} not found`);
    if (!data.itemId || !data.quantity) throw new BadRequestException('itemId and quantity are required');
    const d = this.detailRepo.create({
      tenantId, formulaId, lineType: data.lineType ?? FormulaLineType.INGREDIENT,
      itemId: data.itemId, quantity: data.quantity, uom: data.uom ?? 'KG', scrapPct: data.scrapPct ?? 0,
    } as any) as unknown as FormulaDetail;
    return (this.detailRepo.save(d) as unknown) as Promise<FormulaDetail>;
  }

  async approveFormula(tenantId: string, id: string): Promise<Formula> {
    const formula = await this.formulaRepo.findOne({ where: { id, tenantId } });
    if (!formula) throw new NotFoundException(`Formula ${id} not found`);
    const details = await this.detailRepo.find({ where: { tenantId, formulaId: id } });
    if (!details.some((d) => d.lineType === FormulaLineType.INGREDIENT)) {
      throw new BadRequestException('Formula needs at least one ingredient before approval');
    }
    formula.status = FormulaStatus.APPROVED;
    return (this.formulaRepo.save(formula) as unknown) as Promise<Formula>;
  }

  // ─── Ph-160: Batch scaling ────────────────────────────────────────

  /**
   * Scale a formula to a target output. Ingredient qty scales linearly by the
   * scale factor and is grossed up for scrap; yield % reduces effective output.
   */
  scaleFormula(formula: Formula, details: FormulaDetail[], targetOutput: number) {
    if (targetOutput <= 0) throw new BadRequestException('targetOutput must be > 0');
    const scaleFactor = round4(targetOutput / Number(formula.outputQuantity));
    const ingredients: Array<{ itemId: string; quantity: number; uom: string }> = [];
    const outputs: Array<{ itemId: string; lineType: string; quantity: number; uom: string }> = [];
    // the product itself
    outputs.push({ itemId: formula.productItemId, lineType: 'PRODUCT', quantity: round4(targetOutput * (Number(formula.yieldPct) / 100)), uom: formula.outputUom });
    for (const d of details) {
      const scaled = round4(Number(d.quantity) * scaleFactor);
      if (d.lineType === FormulaLineType.INGREDIENT) {
        const grossed = round4(scaled * (1 + Number(d.scrapPct) / 100));
        ingredients.push({ itemId: d.itemId, quantity: grossed, uom: d.uom });
      } else {
        outputs.push({ itemId: d.itemId, lineType: d.lineType, quantity: scaled, uom: d.uom });
      }
    }
    return { scaleFactor, ingredients, outputs };
  }

  async createBatch(tenantId: string, data: { formulaId: string; targetOutput: number; plannedDate?: string }): Promise<Batch> {
    const { formula, details } = await this.getFormula(tenantId, data.formulaId);
    if (formula.status !== FormulaStatus.APPROVED) throw new BadRequestException('Formula must be APPROVED to create a batch');
    const { scaleFactor, ingredients, outputs } = this.scaleFormula(formula, details, data.targetOutput);
    const batchNumber = await this.nextBatchNumber(tenantId);
    const batch = this.batchRepo.create({
      tenantId, batchNumber, formulaId: formula.id, productItemId: formula.productItemId,
      targetOutput: data.targetOutput, scaleFactor, status: BatchStatus.PLANNED,
      ingredients, outputs, operations: [], plannedDate: data.plannedDate ?? null,
    } as any) as unknown as Batch;
    return (this.batchRepo.save(batch) as unknown) as Promise<Batch>;
  }

  // ─── Ph-161: Process operations ───────────────────────────────────

  async setOperations(tenantId: string, batchId: string, operations: Array<{ sequence: number; description: string; equipmentId?: string }>): Promise<Batch> {
    const batch = await this.getBatch(tenantId, batchId);
    batch.operations = operations.map((o) => ({ ...o, status: 'PENDING' }));
    return (this.batchRepo.save(batch) as unknown) as Promise<Batch>;
  }

  async startBatch(tenantId: string, batchId: string): Promise<Batch> {
    const batch = await this.getBatch(tenantId, batchId);
    if (batch.status !== BatchStatus.PLANNED) throw new BadRequestException('Only PLANNED batches can be started');
    batch.status = BatchStatus.IN_PROGRESS;
    return (this.batchRepo.save(batch) as unknown) as Promise<Batch>;
  }

  async completeBatch(tenantId: string, batchId: string, data: { actualOutput: number; lotNumber?: string }): Promise<Batch> {
    const batch = await this.getBatch(tenantId, batchId);
    if (batch.status !== BatchStatus.IN_PROGRESS) throw new BadRequestException('Only IN_PROGRESS batches can be completed');
    if (data.actualOutput == null || data.actualOutput < 0) throw new BadRequestException('actualOutput is required');
    batch.actualOutput = round4(data.actualOutput);
    batch.lotNumber = data.lotNumber ?? batch.batchNumber;
    batch.status = BatchStatus.LAB_HOLD; // must pass lab before release
    batch.completedAt = new Date();
    return (this.batchRepo.save(batch) as unknown) as Promise<Batch>;
  }

  // ─── Ph-162: Lab release gate ─────────────────────────────────────

  async labResult(tenantId: string, batchId: string, data: { result: 'PASS' | 'FAIL'; note?: string }): Promise<Batch> {
    const batch = await this.getBatch(tenantId, batchId);
    if (batch.status !== BatchStatus.LAB_HOLD) throw new BadRequestException('Batch is not awaiting lab results');
    batch.labResult = data.result;
    batch.labNote = data.note ?? null;
    if (data.result === 'PASS') {
      batch.status = BatchStatus.RELEASED;
      batch.releasedAt = new Date();
    } else {
      batch.status = BatchStatus.REJECTED;
    }
    return (this.batchRepo.save(batch) as unknown) as Promise<Batch>;
  }

  listBatches(tenantId: string, status?: BatchStatus): Promise<Batch[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.batchRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getBatch(tenantId: string, id: string): Promise<Batch> {
    const batch = await this.batchRepo.findOne({ where: { id, tenantId } });
    if (!batch) throw new NotFoundException(`Batch ${id} not found`);
    return batch;
  }

  private async nextBatchNumber(tenantId: string): Promise<string> {
    const count = await this.batchRepo.count({ where: { tenantId } });
    return `BATCH-${String(count + 1).padStart(6, '0')}`;
  }
}
