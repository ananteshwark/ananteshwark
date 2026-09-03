import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { FunctionalLocation } from './entities/functional-location.entity';
import { CounterReading } from './entities/counter-reading.entity';
import { MaintenancePlan } from './entities/maintenance-plan.entity';
import {
  CreateFunctionalLocationDto, UpdateFunctionalLocationDto, CreateCounterReadingDto,
} from './dto/maintenance.dto';

export interface FunctionalLocationNode extends FunctionalLocation {
  children: FunctionalLocationNode[];
}

@Injectable()
export class FunctionalLocationService {
  constructor(
    @InjectRepository(FunctionalLocation) private readonly flocRepo: Repository<FunctionalLocation>,
    @InjectRepository(CounterReading) private readonly readingRepo: Repository<CounterReading>,
    @InjectRepository(MaintenancePlan) private readonly planRepo: Repository<MaintenancePlan>,
  ) {}

  // ---- Functional Location CRUD ----
  async list(tenantId: string): Promise<FunctionalLocation[]> {
    return this.flocRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async create(tenantId: string, dto: CreateFunctionalLocationDto): Promise<FunctionalLocation> {
    return this.flocRepo.save(this.flocRepo.create({ ...dto, tenantId }));
  }

  async update(tenantId: string, id: string, dto: UpdateFunctionalLocationDto): Promise<FunctionalLocation> {
    const floc = await this.flocRepo.findOne({ where: { tenantId, id } });
    if (!floc) throw new NotFoundException(`Functional location ${id} not found`);
    Object.assign(floc, dto);
    return this.flocRepo.save(floc);
  }

  async remove(tenantId: string, id: string): Promise<{ id: string }> {
    const floc = await this.flocRepo.findOne({ where: { tenantId, id } });
    if (!floc) throw new NotFoundException(`Functional location ${id} not found`);
    await this.flocRepo.remove(floc);
    return { id };
  }

  async getTree(tenantId: string): Promise<FunctionalLocationNode[]> {
    const all = await this.flocRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
    const map = new Map<string, FunctionalLocationNode>();
    all.forEach(f => map.set(f.id, { ...f, children: [] }));
    const roots: FunctionalLocationNode[] = [];
    map.forEach(node => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  // ---- Counter Readings ----
  async listReadings(tenantId: string, equipmentId: string): Promise<CounterReading[]> {
    return this.readingRepo.find({
      where: { tenantId, equipmentId },
      order: { readingDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async recordCounterReading(
    tenantId: string,
    equipmentId: string,
    dto: CreateCounterReadingDto,
    recordedBy: string | null,
  ): Promise<{ reading: CounterReading; duePlans: MaintenancePlan[] }> {
    const reading = await this.readingRepo.save(
      this.readingRepo.create({ ...dto, tenantId, equipmentId, recordedBy }),
    );

    // Update COUNTER-triggered plans on this equipment matching the counter type.
    const plans = await this.planRepo.find({ where: { tenantId, equipmentId } });
    const duePlans: MaintenancePlan[] = [];
    for (const plan of plans) {
      if (plan.triggerType !== 'COUNTER' || !plan.counterInterval) continue;
      if (plan.counterType && plan.counterType !== dto.counterType) continue;
      plan.lastCounterReading = dto.reading;
      // Baseline is current nextDueCounter if set, else the first reading itself.
      if (plan.nextDueCounter == null) {
        plan.nextDueCounter = dto.reading + plan.counterInterval;
      }
      // Roll forward the due counter while the reading has passed it.
      while (plan.nextDueCounter != null && dto.reading >= plan.nextDueCounter) {
        duePlans.push(plan);
        plan.nextDueCounter = plan.nextDueCounter + plan.counterInterval;
      }
      await this.planRepo.save(plan);
    }

    // De-duplicate due plans.
    const seen = new Set<string>();
    const unique = duePlans.filter(p => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    return { reading, duePlans: unique };
  }

  // ---- Due Plans (counter + time based) ----
  async getDuePlans(tenantId: string): Promise<MaintenancePlan[]> {
    const today = new Date().toISOString().slice(0, 10);
    const plans = await this.planRepo.find({ where: { tenantId } });
    const due: MaintenancePlan[] = [];
    for (const plan of plans) {
      if (plan.isActive === false) continue;
      if (plan.triggerType === 'COUNTER') {
        if (
          plan.nextDueCounter != null &&
          plan.lastCounterReading != null &&
          plan.lastCounterReading >= plan.nextDueCounter
        ) {
          due.push(plan);
        }
      } else {
        // Time-based (default): past or equal to next due date.
        if (plan.nextDueDate && plan.nextDueDate <= today) due.push(plan);
      }
    }
    return due;
  }
}
