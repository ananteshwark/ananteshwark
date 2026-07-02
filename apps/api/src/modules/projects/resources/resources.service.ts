import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectResource } from './entities/project-resource.entity';
import { ResourceRequest, ResourceRequestStatus } from './entities/resource-request.entity';
import { ResourceAllocation } from './entities/resource-allocation.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(ProjectResource) private readonly resourceRepo: Repository<ProjectResource>,
    @InjectRepository(ResourceRequest) private readonly requestRepo: Repository<ResourceRequest>,
    @InjectRepository(ResourceAllocation) private readonly allocRepo: Repository<ResourceAllocation>,
  ) {}

  // ─── Ph-242: resource pool ────────────────────────────────────────

  async updateResource(tenantId: string, id: string, dto: any): Promise<ProjectResource> {
    const r = await this.resourceRepo.findOne({ where: { id, tenantId } });
    if (!r) throw new NotFoundException(`Resource ${id} not found`);
    const { tenantId: _t, id: _i, ...rest } = dto ?? {};
    Object.assign(r, rest);
    return (this.resourceRepo.save(r) as unknown) as Promise<ProjectResource>;
  }

  listResources(tenantId: string): Promise<ProjectResource[]> {
    return this.resourceRepo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  async createResource(tenantId: string, data: { employeeId: string; name: string; skills?: string[]; grade?: string; costRate?: number; weeklyCapacityHours?: number }): Promise<ProjectResource> {
    if (!data.employeeId || !data.name?.trim()) throw new BadRequestException('employeeId and name are required');
    const dup = await this.resourceRepo.findOne({ where: { tenantId, employeeId: data.employeeId } });
    if (dup) throw new BadRequestException('Resource already exists for this employee');
    const r = this.resourceRepo.create({
      tenantId, employeeId: data.employeeId, name: data.name, skills: data.skills ?? [], grade: data.grade ?? null,
      costRate: data.costRate ?? 0, weeklyCapacityHours: data.weeklyCapacityHours ?? 40, isActive: true,
    } as any) as unknown as ProjectResource;
    return (this.resourceRepo.save(r) as unknown) as Promise<ProjectResource>;
  }

  /** Find active resources with a skill (and optional grade). */
  async findBySkill(tenantId: string, skill: string, grade?: string): Promise<ProjectResource[]> {
    const all = await this.resourceRepo.find({ where: { tenantId } });
    const s = skill.toLowerCase();
    return all.filter((r) => r.isActive && (r.skills ?? []).some((x) => String(x).toLowerCase() === s) && (!grade || r.grade === grade));
  }

  // ─── Ph-243: resource requests ────────────────────────────────────

  listRequests(tenantId: string, status?: ResourceRequestStatus): Promise<ResourceRequest[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.requestRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async createRequest(tenantId: string, data: { projectId: string; requestedBy: string; skill: string; grade?: string; hoursNeeded: number; startWeek?: string }): Promise<ResourceRequest> {
    if (!data.projectId || !data.skill?.trim()) throw new BadRequestException('projectId and skill are required');
    if (data.hoursNeeded == null || data.hoursNeeded <= 0) throw new BadRequestException('hoursNeeded must be > 0');
    const r = this.requestRepo.create({
      tenantId, projectId: data.projectId, requestedBy: data.requestedBy, skill: data.skill, grade: data.grade ?? null,
      hoursNeeded: data.hoursNeeded, startWeek: data.startWeek ?? null, status: ResourceRequestStatus.OPEN, fulfilledResourceId: null,
    } as any) as unknown as ResourceRequest;
    return (this.requestRepo.save(r) as unknown) as Promise<ResourceRequest>;
  }

  /** Fulfill an open request by allocating a pool resource to the project. */
  async fulfillRequest(tenantId: string, id: string, resourceId: string): Promise<any> {
    const req = await this.requestRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== ResourceRequestStatus.OPEN) throw new BadRequestException('Only OPEN requests can be fulfilled');
    const resource = await this.resourceRepo.findOne({ where: { id: resourceId, tenantId } });
    if (!resource) throw new NotFoundException('Resource not found');
    if (!(resource.skills ?? []).map((s) => s.toLowerCase()).includes(req.skill.toLowerCase())) {
      throw new BadRequestException(`Resource lacks required skill "${req.skill}"`);
    }
    req.status = ResourceRequestStatus.FULFILLED;
    req.fulfilledResourceId = resourceId;
    await this.requestRepo.save(req);
    let allocation: ResourceAllocation | null = null;
    if (req.startWeek) {
      allocation = (await this.allocRepo.save(this.allocRepo.create({
        tenantId, resourceId, projectId: req.projectId, week: req.startWeek,
        allocatedHours: req.hoursNeeded, billable: true,
      } as any))) as unknown as ResourceAllocation;
    }
    return { request: req, allocation };
  }

  async rejectRequest(tenantId: string, id: string): Promise<ResourceRequest> {
    const req = await this.requestRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== ResourceRequestStatus.OPEN) throw new BadRequestException('Only OPEN requests can be rejected');
    req.status = ResourceRequestStatus.REJECTED;
    return (this.requestRepo.save(req) as unknown) as Promise<ResourceRequest>;
  }

  // ─── Ph-244: utilization reporting ────────────────────────────────

  async allocate(tenantId: string, data: { resourceId: string; projectId: string; week: string; allocatedHours: number; billable?: boolean }): Promise<ResourceAllocation> {
    if (!/^\d{4}-W\d{2}$/.test(data.week ?? '')) throw new BadRequestException('week must be YYYY-Www');
    if (data.allocatedHours == null || data.allocatedHours < 0) throw new BadRequestException('allocatedHours must be >= 0');
    const a = this.allocRepo.create({
      tenantId, resourceId: data.resourceId, projectId: data.projectId, week: data.week,
      allocatedHours: data.allocatedHours, billable: data.billable ?? true,
    } as any) as unknown as ResourceAllocation;
    return (this.allocRepo.save(a) as unknown) as Promise<ResourceAllocation>;
  }

  /**
   * Utilization for a week across resources: allocated vs capacity, billable %,
   * and over/under-allocation flags.
   */
  async utilization(tenantId: string, week: string, underThresholdPct = 60): Promise<any> {
    const [resources, allocations] = await Promise.all([
      this.resourceRepo.find({ where: { tenantId } }),
      this.allocRepo.find({ where: { tenantId, week } }),
    ]);
    const rows = resources.filter((r) => r.isActive).map((r) => {
      const allocs = allocations.filter((a) => a.resourceId === r.id);
      const allocated = round2(allocs.reduce((s, a) => s + Number(a.allocatedHours), 0));
      const billable = round2(allocs.filter((a) => a.billable).reduce((s, a) => s + Number(a.allocatedHours), 0));
      const capacity = Number(r.weeklyCapacityHours);
      const utilizationPct = capacity > 0 ? round2((allocated / capacity) * 100) : 0;
      const billablePct = capacity > 0 ? round2((billable / capacity) * 100) : 0;
      let flag: 'OVER' | 'UNDER' | 'OK' = 'OK';
      if (allocated > capacity) flag = 'OVER';
      else if (utilizationPct < underThresholdPct) flag = 'UNDER';
      return { resourceId: r.id, name: r.name, capacity, allocated, billable, utilizationPct, billablePct, flag };
    });
    const totalCapacity = round2(rows.reduce((s, r) => s + r.capacity, 0));
    const totalAllocated = round2(rows.reduce((s, r) => s + r.allocated, 0));
    const totalBillable = round2(rows.reduce((s, r) => s + r.billable, 0));
    return {
      week, totalCapacity, totalAllocated, totalBillable,
      teamUtilizationPct: totalCapacity > 0 ? round2((totalAllocated / totalCapacity) * 100) : 0,
      teamBillablePct: totalCapacity > 0 ? round2((totalBillable / totalCapacity) * 100) : 0,
      overAllocated: rows.filter((r) => r.flag === 'OVER').length,
      underAllocated: rows.filter((r) => r.flag === 'UNDER').length,
      resources: rows.sort((a, b) => b.utilizationPct - a.utilizationPct),
    };
  }
}
