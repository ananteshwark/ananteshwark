import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { OkrCycle } from './entities/okr-cycle.entity';
import { Objective, ObjectiveStatus, OwnerType } from './entities/objective.entity';
import { KeyResult, KrStatus } from './entities/key-result.entity';
import { GoalJournalEntry } from './entities/goal-journal.entity';
import { CreateCycleDto, CreateObjectiveDto, CreateKeyResultDto, UpdateKrProgressDto } from './dto/goals.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

@Injectable()
export class GoalsService {
  constructor(
    @InjectRepository(OkrCycle) private cycleRepo: Repository<OkrCycle>,
    @InjectRepository(Objective) private objectiveRepo: Repository<Objective>,
    @InjectRepository(KeyResult) private krRepo: Repository<KeyResult>,
    @Optional() @InjectRepository(GoalJournalEntry)
    private readonly journalRepo?: Repository<GoalJournalEntry>,
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

  // ---- Goal journal ----
  async addJournalEntry(
    tenantId: string, objectiveId: string,
    author: { userId: string; name: string }, entry: string,
  ): Promise<GoalJournalEntry> {
    if (!this.journalRepo) throw new BadRequestException('Goal journal is not available in this deployment');
    if (!entry?.trim()) throw new BadRequestException('Entry text is required');
    const objective = await this.objectiveRepo.findOne({ where: { id: objectiveId, tenantId } });
    if (!objective) throw new NotFoundException(`Objective ${objectiveId} not found`);
    return this.journalRepo.save(this.journalRepo.create({
      tenantId, objectiveId, authorUserId: author.userId, authorName: author.name, entry: entry.trim(),
    }));
  }

  async listJournal(tenantId: string, objectiveId: string): Promise<GoalJournalEntry[]> {
    if (!this.journalRepo) return [];
    return this.journalRepo.find({ where: { tenantId, objectiveId }, order: { createdAt: 'DESC' } });
  }

  // ---- Goal explorer ----
  /** Peers' individual objectives in a cycle — the browse-and-learn view. */
  async listPeerObjectives(tenantId: string, cycleId: string, excludeOwnerId?: string): Promise<Objective[]> {
    const where: any = { tenantId, cycleId, ownerType: OwnerType.INDIVIDUAL };
    if (excludeOwnerId) where.ownerId = Not(excludeOwnerId);
    return this.objectiveRepo.find({ where, order: { progress: 'DESC' } });
  }

  /** Copy a peer's objective (with its key results, progress reset) to a new owner. */
  async copyObjective(
    tenantId: string, objectiveId: string,
    dto: { ownerId: string; cycleId?: string },
  ): Promise<Objective> {
    const source = await this.objectiveRepo.findOne({ where: { id: objectiveId, tenantId } });
    if (!source) throw new NotFoundException(`Objective ${objectiveId} not found`);
    if (!dto.ownerId) throw new BadRequestException('ownerId is required');

    const copy = await this.objectiveRepo.save(this.objectiveRepo.create({
      tenantId,
      cycleId: dto.cycleId ?? source.cycleId,
      title: source.title,
      description: source.description,
      ownerId: dto.ownerId,
      ownerType: OwnerType.INDIVIDUAL,
      weight: source.weight,
      progress: 0,
      status: ObjectiveStatus.ON_TRACK,
    }));
    const krs = await this.krRepo.find({ where: { objectiveId: source.id, tenantId } });
    for (const kr of krs) {
      await this.krRepo.save(this.krRepo.create({
        tenantId,
        objectiveId: copy.id,
        title: kr.title,
        description: kr.description,
        metric: kr.metric,
        targetValue: kr.targetValue,
        currentValue: 0,
        unit: kr.unit,
        progress: 0,
      }));
    }
    return copy;
  }

  // ---- Bulk goal assignment ----
  /** Create the same objective (with key results) for many owners at once. */
  async bulkCreateObjectives(
    tenantId: string,
    dto: {
      cycleId: string; title: string; description?: string; weight?: number;
      ownerIds: string[];
      keyResults?: Array<{ title: string; metric?: string; targetValue: number; unit?: string }>;
    },
  ): Promise<{ created: number; objectives: Objective[] }> {
    if (!dto.cycleId || !dto.title?.trim()) throw new BadRequestException('cycleId and title are required');
    const ownerIds = [...new Set((dto.ownerIds ?? []).filter(Boolean))];
    if (!ownerIds.length) throw new BadRequestException('At least one ownerId is required');

    const objectives: Objective[] = [];
    for (const ownerId of ownerIds) {
      const objective = await this.objectiveRepo.save(this.objectiveRepo.create({
        tenantId,
        cycleId: dto.cycleId,
        title: dto.title.trim(),
        description: dto.description ?? null,
        ownerId,
        ownerType: OwnerType.INDIVIDUAL,
        weight: dto.weight ?? 1,
        progress: 0,
      } as any)) as unknown as Objective;
      for (const kr of dto.keyResults ?? []) {
        await this.krRepo.save(this.krRepo.create({
          tenantId, objectiveId: objective.id, title: kr.title, metric: kr.metric ?? null,
          targetValue: kr.targetValue, currentValue: 0, unit: kr.unit ?? null, progress: 0,
        } as any));
      }
      objectives.push(objective);
    }
    return { created: objectives.length, objectives };
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
