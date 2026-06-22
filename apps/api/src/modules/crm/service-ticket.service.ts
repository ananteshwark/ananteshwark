import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ServiceTicket,
  TicketPriority,
  TicketStatus,
} from './entities/service-ticket.entity';
import { SlaPolicy } from './entities/sla-policy.entity';
import { TicketComment } from './entities/ticket-comment.entity';

const DEFAULT_SLA: Record<TicketPriority, { response: number; resolution: number }> = {
  [TicketPriority.LOW]: { response: 480, resolution: 2880 },
  [TicketPriority.MEDIUM]: { response: 240, resolution: 1440 },
  [TicketPriority.HIGH]: { response: 120, resolution: 480 },
  [TicketPriority.CRITICAL]: { response: 30, resolution: 240 },
};

@Injectable()
export class ServiceTicketService {
  constructor(
    @InjectRepository(ServiceTicket)
    private readonly ticketRepo: Repository<ServiceTicket>,
    @InjectRepository(SlaPolicy)
    private readonly slaRepo: Repository<SlaPolicy>,
    @InjectRepository(TicketComment)
    private readonly commentRepo: Repository<TicketComment>,
  ) {}

  // ─── Ticket numbering ─────────────────────────────────────────

  private async nextTicketNumber(tenantId: string): Promise<string> {
    const row = await this.ticketRepo
      .createQueryBuilder('t')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(t.ticket_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('t.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `TKT-${String(next).padStart(4, '0')}`;
  }

  private async slaMinutes(
    tenantId: string,
    priority: TicketPriority,
  ): Promise<{ response: number; resolution: number }> {
    const policy = await this.slaRepo.findOne({
      where: { tenantId, priority, isActive: true },
    });
    if (policy) {
      return { response: policy.responseMinutes, resolution: policy.resolutionMinutes };
    }
    return DEFAULT_SLA[priority] ?? DEFAULT_SLA[TicketPriority.MEDIUM];
  }

  // ─── Tickets ──────────────────────────────────────────────────

  async createTicket(tenantId: string, dto: Partial<ServiceTicket>): Promise<ServiceTicket> {
    const priority = (dto.priority as TicketPriority) ?? TicketPriority.MEDIUM;
    const ticketNumber = await this.nextTicketNumber(tenantId);
    const { response, resolution } = await this.slaMinutes(tenantId, priority);
    const now = Date.now();
    const entity = this.ticketRepo.create({
      ...dto,
      tenantId,
      ticketNumber,
      priority,
      status: (dto.status as TicketStatus) ?? TicketStatus.OPEN,
      slaResponseDueAt: new Date(now + response * 60_000),
      slaResolutionDueAt: new Date(now + resolution * 60_000),
    });
    return this.ticketRepo.save(entity);
  }

  async listTickets(
    tenantId: string,
    filters?: {
      status?: TicketStatus;
      priority?: TicketPriority;
      assignedToUserId?: string;
      customerId?: string;
    },
  ): Promise<ServiceTicket[]> {
    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .where('t.tenantId = :tenantId', { tenantId });
    if (filters?.status) qb.andWhere('t.status = :status', { status: filters.status });
    if (filters?.priority) qb.andWhere('t.priority = :priority', { priority: filters.priority });
    if (filters?.assignedToUserId)
      qb.andWhere('t.assignedToUserId = :a', { a: filters.assignedToUserId });
    if (filters?.customerId) qb.andWhere('t.customerId = :c', { c: filters.customerId });
    qb.orderBy('t.createdAt', 'DESC');
    return qb.getMany();
  }

  async getTicket(
    tenantId: string,
    id: string,
  ): Promise<ServiceTicket & { comments: TicketComment[] }> {
    const ticket = await this.ticketRepo.findOne({ where: { id, tenantId } });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    const comments = await this.commentRepo.find({
      where: { tenantId, ticketId: id },
      order: { createdAt: 'ASC' },
    });
    return { ...ticket, comments };
  }

  private recomputeBreach(ticket: ServiceTicket): void {
    const now = Date.now();
    const dueAt = ticket.slaResolutionDueAt ? ticket.slaResolutionDueAt.getTime() : null;
    if (dueAt == null) {
      ticket.slaBreached = false;
      return;
    }
    if (ticket.resolvedAt) {
      ticket.slaBreached = ticket.resolvedAt.getTime() > dueAt;
    } else {
      ticket.slaBreached = now > dueAt;
    }
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: TicketStatus,
  ): Promise<ServiceTicket> {
    const ticket = await this.ticketRepo.findOne({ where: { id, tenantId } });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    if (
      status !== TicketStatus.OPEN &&
      ticket.status === TicketStatus.OPEN &&
      !ticket.firstResponseAt
    ) {
      ticket.firstResponseAt = new Date();
    }
    if (status === TicketStatus.RESOLVED && !ticket.resolvedAt) {
      ticket.resolvedAt = new Date();
    }
    ticket.status = status;
    this.recomputeBreach(ticket);
    return this.ticketRepo.save(ticket);
  }

  async addComment(
    tenantId: string,
    ticketId: string,
    authorUserId: string | null,
    dto: { body: string; isInternal?: boolean },
  ): Promise<TicketComment> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId, tenantId } });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);
    if (!ticket.firstResponseAt) {
      ticket.firstResponseAt = new Date();
      await this.ticketRepo.save(ticket);
    }
    const comment = this.commentRepo.create({
      tenantId,
      ticketId,
      authorUserId,
      body: dto.body,
      isInternal: dto.isInternal ?? false,
    });
    return this.commentRepo.save(comment);
  }

  async assignTicket(
    tenantId: string,
    id: string,
    assignedToUserId: string | null,
  ): Promise<ServiceTicket> {
    const ticket = await this.ticketRepo.findOne({ where: { id, tenantId } });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    ticket.assignedToUserId = assignedToUserId;
    return this.ticketRepo.save(ticket);
  }

  async setCsat(tenantId: string, id: string, csatScore: number): Promise<ServiceTicket> {
    const ticket = await this.ticketRepo.findOne({ where: { id, tenantId } });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    ticket.csatScore = csatScore;
    return this.ticketRepo.save(ticket);
  }

  // ─── Dashboard ────────────────────────────────────────────────

  async getDashboard(tenantId: string): Promise<any> {
    const tickets = await this.ticketRepo.find({ where: { tenantId } });
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let breached = 0;
    let resolutionTotalMs = 0;
    let resolvedCount = 0;
    const now = Date.now();
    for (const t of tickets) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
      const dueAt = t.slaResolutionDueAt ? t.slaResolutionDueAt.getTime() : null;
      const isBreached = t.resolvedAt
        ? dueAt != null && t.resolvedAt.getTime() > dueAt
        : dueAt != null && now > dueAt;
      if (isBreached) breached += 1;
      if (t.resolvedAt) {
        resolutionTotalMs += t.resolvedAt.getTime() - t.createdAt.getTime();
        resolvedCount += 1;
      }
    }
    const avgResolutionHours =
      resolvedCount > 0
        ? Math.round((resolutionTotalMs / resolvedCount / 3_600_000) * 10) / 10
        : 0;
    return {
      total: tickets.length,
      byStatus,
      byPriority,
      breached,
      avgResolutionHours,
    };
  }

  // ─── SLA policies ─────────────────────────────────────────────

  async listSlaPolicies(tenantId: string): Promise<SlaPolicy[]> {
    return this.slaRepo.find({ where: { tenantId }, order: { priority: 'ASC' } });
  }

  async saveSlaPolicy(tenantId: string, dto: Partial<SlaPolicy>): Promise<SlaPolicy> {
    const priority = dto.priority as TicketPriority;
    let policy = await this.slaRepo.findOne({ where: { tenantId, priority } });
    if (policy) {
      Object.assign(policy, dto, { tenantId, priority });
    } else {
      policy = this.slaRepo.create({ ...dto, tenantId, priority });
    }
    return this.slaRepo.save(policy);
  }
}
