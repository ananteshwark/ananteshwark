import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OkrCycle } from './entities/okr-cycle.entity';
import { Objective, ObjectiveStatus } from './entities/objective.entity';
import { KeyResult, KrStatus } from './entities/key-result.entity';
import { CreateCycleDto, CreateObjectiveDto, CreateKeyResultDto, UpdateKrProgressDto } from './dto/goals.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

@Injectable()
export class GoalsService {
  constructor(
    @InjectRepository(OkrCycle) private cycleRepo: Repository<OkrCycle>,
    @InjectRepository(Objective) private objectiveRepo: Repository<Objective>,
    @InjectRepository(KeyResult) private krRepo: Repository<KeyResult>,
  ) {}

  async createCycle(tenantId: string, dto: CreateCycleDto): Promise<OkrCycle> {
    const cycle = this.cycleRepo.create({ ...dto, tenantId });
    return this.cycleRepo.save(cycle);
  }

  async listCycles(tenantId: string): Promise<OkrCycle[]> {
    return this.cycleRepo.find({ where: { tenantId }, order: { startDate: 'DESC' } });
  }

  async createObjective(tenantId: string, dto: CreateObjectiveDto): Promise<Objective> {
    const obj = this.objectiveRepo.create({ ...dto, tenantId, progress: 0 });
    return this.objectiveRepo.save(obj);
  }

  async listObjectives(tenantId: string, cycleId?: string): Promise<Objective[]> {
    const where: any = { tenantId };
    if (cycleId) where.cycleId = cycleId;
    return this.objectiveRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async createKeyResult(tenantId: string, dto: CreateKeyResultDto): Promise<KeyResult> {
    const kr = this.krRepo.create({ ...dto, tenantId, progress: 0 });
    return this.krRepo.save(kr);
  }

  async listKeyResults(tenantId: string, objectiveId: string): Promise<KeyResult[]> {
    return this.krRepo.find({ where: { objectiveId, tenantId }, order: { createdAt: 'ASC' } });
  }

  async updateKeyResultProgress(tenantId: string, id: string, dto: UpdateKrProgressDto): Promise<KeyResult> {
    const kr = await this.krRepo.findOne({ where: { id, tenantId } });
    if (!kr) throw new NotFoundException('Key result not found');
    kr.currentValue = dto.currentValue;
    if (kr.targetValue > 0) {
      kr.progress = Math.min(100, Math.round((dto.currentValue / kr.targetValue) * 100));
    }
    if (dto.status) kr.status = dto.status as KrStatus;
    if (kr.progress >= 100) kr.status = KrStatus.ACHIEVED;
    const saved = await this.krRepo.save(kr);
    await this.recalculateObjectiveProgress(tenantId, kr.objectiveId);
    return saved;
  }

  private async recalculateObjectiveProgress(tenantId: string, objectiveId: string): Promise<void> {
    const krs = await this.krRepo.find({ where: { objectiveId, tenantId } });
    if (!krs.length) return;
    const avgProgress = krs.reduce((sum, kr) => sum + Number(kr.progress), 0) / krs.length;
    const status = avgProgress >= 100 ? ObjectiveStatus.ACHIEVED : avgProgress >= 70 ? ObjectiveStatus.ON_TRACK : avgProgress >= 40 ? ObjectiveStatus.AT_RISK : ObjectiveStatus.BEHIND;
    await this.objectiveRepo.update({ id: objectiveId, tenantId }, { progress: Math.round(avgProgress), status });
  }

  async getDashboard(tenantId: string, cycleId: string): Promise<any> {
    const objectives = await this.objectiveRepo.find({ where: { cycleId, tenantId } });
    const krs = await this.krRepo.createQueryBuilder('kr')
      .innerJoin(Objective, 'o', 'o.id = kr.objective_id AND o.cycle_id = :cycleId', { cycleId })
      .where('kr.tenant_id = :tenantId', { tenantId })
      .getMany();
    return {
      totalObjectives: objectives.length,
      achieved: objectives.filter(o => o.status === ObjectiveStatus.ACHIEVED).length,
      onTrack: objectives.filter(o => o.status === ObjectiveStatus.ON_TRACK).length,
      atRisk: objectives.filter(o => o.status === ObjectiveStatus.AT_RISK).length,
      behind: objectives.filter(o => o.status === ObjectiveStatus.BEHIND).length,
      avgProgress: objectives.length ? Math.round(objectives.reduce((s, o) => s + Number(o.progress), 0) / objectives.length) : 0,
      totalKeyResults: krs.length,
    };
  }
}
