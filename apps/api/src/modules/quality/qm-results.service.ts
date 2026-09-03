import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InspectionPlan } from './entities/inspection-plan.entity';
import { InspectionLot, InspectionLotStatus, UsageDecision } from './entities/inspection-lot.entity';
import { NonConformance, NcrSeverity, NcrStatus } from './entities/non-conformance.entity';
import { QualityCharacteristic, CharacteristicType } from './entities/quality-characteristic.entity';
import { InspectionResult, ResultVerdict } from './entities/inspection-result.entity';
import {
  CreateCharacteristicDto, UpdateCharacteristicDto,
  RecordInspectionResultsDto, SetUsageDecisionDto,
} from './dto/quality.dto';

@Injectable()
export class QmResultsService {
  constructor(
    @InjectRepository(InspectionPlan) private readonly planRepo: Repository<InspectionPlan>,
    @InjectRepository(InspectionLot) private readonly lotRepo: Repository<InspectionLot>,
    @InjectRepository(NonConformance) private readonly ncrRepo: Repository<NonConformance>,
    @InjectRepository(QualityCharacteristic) private readonly charRepo: Repository<QualityCharacteristic>,
    @InjectRepository(InspectionResult) private readonly resultRepo: Repository<InspectionResult>,
  ) {}

  // ---- Characteristics ----
  private async findPlan(tenantId: string, planId: string): Promise<InspectionPlan> {
    const plan = await this.planRepo.findOne({ where: { tenantId, id: planId } });
    if (!plan) throw new NotFoundException(`Inspection plan ${planId} not found`);
    return plan;
  }

  async listCharacteristics(tenantId: string, planId: string): Promise<QualityCharacteristic[]> {
    await this.findPlan(tenantId, planId);
    return this.charRepo.find({
      where: { tenantId, inspectionPlanId: planId },
      order: { sequence: 'ASC', createdAt: 'ASC' },
    });
  }

  async createCharacteristic(tenantId: string, planId: string, dto: CreateCharacteristicDto): Promise<QualityCharacteristic> {
    await this.findPlan(tenantId, planId);
    return this.charRepo.save(this.charRepo.create({ ...dto, tenantId, inspectionPlanId: planId }));
  }

  async updateCharacteristic(tenantId: string, id: string, dto: UpdateCharacteristicDto): Promise<QualityCharacteristic> {
    const char = await this.charRepo.findOne({ where: { tenantId, id } });
    if (!char) throw new NotFoundException(`Characteristic ${id} not found`);
    Object.assign(char, dto);
    return this.charRepo.save(char);
  }

  async deleteCharacteristic(tenantId: string, id: string): Promise<{ deleted: boolean }> {
    const char = await this.charRepo.findOne({ where: { tenantId, id } });
    if (!char) throw new NotFoundException(`Characteristic ${id} not found`);
    await this.charRepo.remove(char);
    return { deleted: true };
  }

  // ---- Results ----
  private deriveMeasuredVerdict(char: QualityCharacteristic, value: number | null | undefined): ResultVerdict {
    if (value === null || value === undefined) return ResultVerdict.FAIL;
    const hasLower = char.lowerLimit !== null && char.lowerLimit !== undefined;
    const hasUpper = char.upperLimit !== null && char.upperLimit !== undefined;
    if (hasLower || hasUpper) {
      if (hasLower && value < (char.lowerLimit as number)) return ResultVerdict.FAIL;
      if (hasUpper && value > (char.upperLimit as number)) return ResultVerdict.FAIL;
      return ResultVerdict.PASS;
    }
    // No limits: fall back to target tolerance (1% of target, min 0.0001)
    if (char.target !== null && char.target !== undefined) {
      const target = char.target as number;
      const tolerance = Math.max(Math.abs(target) * 0.01, 0.0001);
      return Math.abs(value - target) <= tolerance ? ResultVerdict.PASS : ResultVerdict.FAIL;
    }
    return ResultVerdict.FAIL;
  }

  async recordResults(tenantId: string, lotId: string, dto: RecordInspectionResultsDto, userId?: string): Promise<InspectionResult[]> {
    const lot = await this.lotRepo.findOne({ where: { tenantId, id: lotId } });
    if (!lot) throw new NotFoundException(`Inspection lot ${lotId} not found`);

    const chars = await this.charRepo.find({ where: { tenantId, inspectionPlanId: lot.planId } });
    const charMap = new Map(chars.map((c) => [c.id, c]));
    const saved: InspectionResult[] = [];

    for (const item of dto.results) {
      const char = charMap.get(item.characteristicId);
      if (!char) throw new NotFoundException(`Characteristic ${item.characteristicId} not found in this lot's plan`);

      let verdict: ResultVerdict;
      if (char.type === CharacteristicType.MEASURED) {
        verdict = this.deriveMeasuredVerdict(char, item.measuredValue);
      } else {
        verdict = item.verdict ?? ResultVerdict.FAIL;
      }

      let row = await this.resultRepo.findOne({
        where: { tenantId, inspectionLotId: lotId, characteristicId: char.id },
      });
      if (!row) {
        row = this.resultRepo.create({
          tenantId,
          inspectionLotId: lotId,
          characteristicId: char.id,
        });
      }
      row.characteristicName = char.name;
      row.measuredValue = char.type === CharacteristicType.MEASURED ? (item.measuredValue ?? null) : null;
      row.qualitativeValue = char.type === CharacteristicType.QUALITATIVE ? (item.qualitativeValue ?? null) : null;
      row.verdict = verdict;
      row.recordedBy = userId ?? null;
      row.recordedAt = new Date();
      saved.push(await this.resultRepo.save(row));
    }

    // Reflect overall pass/fail on lot status
    const all = await this.resultRepo.find({ where: { tenantId, inspectionLotId: lotId } });
    const anyFail = all.some((r) => r.verdict === ResultVerdict.FAIL);
    lot.status = anyFail ? InspectionLotStatus.FAILED : InspectionLotStatus.PASSED;
    await this.lotRepo.save(lot);

    return saved;
  }

  async getLotResults(tenantId: string, lotId: string) {
    const lot = await this.lotRepo.findOne({ where: { tenantId, id: lotId } });
    if (!lot) throw new NotFoundException(`Inspection lot ${lotId} not found`);

    const chars = await this.charRepo.find({
      where: { tenantId, inspectionPlanId: lot.planId },
      order: { sequence: 'ASC', createdAt: 'ASC' },
    });
    const results = await this.resultRepo.find({ where: { tenantId, inspectionLotId: lotId } });
    const resultMap = new Map(results.map((r) => [r.characteristicId, r]));

    return {
      lot,
      characteristics: chars.map((c) => ({
        characteristic: c,
        result: resultMap.get(c.id) ?? null,
      })),
    };
  }

  // ---- Usage Decision ----
  private async nextNcrNumber(tenantId: string): Promise<string> {
    const row = await this.ncrRepo
      .createQueryBuilder('n')
      .select(`MAX(CAST(NULLIF(regexp_replace(n.ncr_number, '\\D', '', 'g'), '') AS INTEGER))`, 'mx')
      .where('n.tenantId = :tenantId', { tenantId })
      .getRawOne();
    return `NCR-${String((row?.mx ?? 0) + 1).padStart(6, '0')}`;
  }

  async setUsageDecision(tenantId: string, lotId: string, dto: SetUsageDecisionDto, userId?: string) {
    const lot = await this.lotRepo.findOne({ where: { tenantId, id: lotId } });
    if (!lot) throw new NotFoundException(`Inspection lot ${lotId} not found`);

    lot.usageDecision = dto.decision;
    lot.usageDecisionAt = new Date();
    lot.usageDecisionBy = userId ?? null;
    if (dto.notes) lot.remarks = dto.notes;
    if (dto.decision === UsageDecision.REJECT) {
      lot.status = InspectionLotStatus.FAILED;
    } else if (dto.decision === UsageDecision.ACCEPT) {
      lot.status = InspectionLotStatus.PASSED;
    }
    await this.lotRepo.save(lot);

    let ncr: NonConformance | null = null;
    if (dto.decision === UsageDecision.REJECT) {
      const ncrNumber = await this.nextNcrNumber(tenantId);
      ncr = await this.ncrRepo.save(this.ncrRepo.create({
        tenantId,
        ncrNumber,
        inspectionLotId: lot.id,
        title: `Rejected inspection lot ${lot.lotNumber}`,
        description: dto.notes ?? `Usage decision REJECT for lot ${lot.lotNumber} (item ${lot.itemCode}).`,
        severity: NcrSeverity.HIGH,
        status: NcrStatus.OPEN,
      }));
    }

    return { lot, ncr };
  }
}
