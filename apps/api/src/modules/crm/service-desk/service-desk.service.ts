import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KbArticle, ArticleStatus, ArticleVisibility } from './entities/kb-article.entity';
import { EmailRoutingRule } from './entities/email-routing-rule.entity';
import { ServiceTicket, TicketPriority, TicketStatus } from '../entities/service-ticket.entity';

@Injectable()
export class ServiceDeskService {
  constructor(
    @InjectRepository(KbArticle) private readonly kbRepo: Repository<KbArticle>,
    @InjectRepository(EmailRoutingRule) private readonly ruleRepo: Repository<EmailRoutingRule>,
    @InjectRepository(ServiceTicket) private readonly ticketRepo: Repository<ServiceTicket>,
  ) {}

  // ─── Ph-229: knowledge base ───────────────────────────────────────

  async updateArticle(tenantId: string, id: string, dto: any): Promise<KbArticle> {
    const article = await this.kbRepo.findOne({ where: { id, tenantId } });
    if (!article) throw new NotFoundException(`Article ${id} not found`);
    const { tenantId: _t, id: _i, ...rest } = dto ?? {};
    Object.assign(article, rest);
    return this.kbRepo.save(article);
  }

  async createArticle(tenantId: string, data: Partial<KbArticle>): Promise<KbArticle> {
    if (!data.title?.trim() || !data.body?.trim()) throw new BadRequestException('title and body are required');
    const a = this.kbRepo.create({
      tenantId, title: data.title, body: data.body, category: data.category ?? null,
      tags: data.tags ?? [], visibility: data.visibility ?? ArticleVisibility.PUBLIC,
      status: data.status ?? ArticleStatus.DRAFT, helpfulCount: 0, notHelpfulCount: 0, viewCount: 0,
    } as any) as unknown as KbArticle;
    return (this.kbRepo.save(a) as unknown) as Promise<KbArticle>;
  }

  async publishArticle(tenantId: string, id: string): Promise<KbArticle> {
    const a = await this.getArticle(tenantId, id);
    a.status = ArticleStatus.PUBLISHED;
    return (this.kbRepo.save(a) as unknown) as Promise<KbArticle>;
  }

  async rateArticle(tenantId: string, id: string, helpful: boolean): Promise<KbArticle> {
    const a = await this.getArticle(tenantId, id);
    if (helpful) a.helpfulCount += 1; else a.notHelpfulCount += 1;
    return (this.kbRepo.save(a) as unknown) as Promise<KbArticle>;
  }

  /**
   * Search published articles by term across title/body/tags. `publicOnly`
   * restricts to portal-visible articles (self-service).
   */
  async searchArticles(tenantId: string, term: string, publicOnly = false): Promise<KbArticle[]> {
    const all = await this.kbRepo.find({ where: { tenantId, status: ArticleStatus.PUBLISHED } });
    const t = (term ?? '').toLowerCase().trim();
    return all
      .filter((a) => !publicOnly || a.visibility === ArticleVisibility.PUBLIC)
      .filter((a) => !t || a.title.toLowerCase().includes(t) || a.body.toLowerCase().includes(t) || (a.tags ?? []).some((x) => String(x).toLowerCase().includes(t)))
      .sort((a, b) => (b.helpfulCount - b.notHelpfulCount) - (a.helpfulCount - a.notHelpfulCount));
  }

  // ─── Ph-230: email-to-ticket ──────────────────────────────────────

  listRules(tenantId: string): Promise<EmailRoutingRule[]> {
    return this.ruleRepo.find({ where: { tenantId }, order: { priorityOrder: 'ASC' } });
  }

  async createRule(tenantId: string, data: Partial<EmailRoutingRule>): Promise<EmailRoutingRule> {
    if (!data.keyword?.trim()) throw new BadRequestException('keyword is required');
    const r = this.ruleRepo.create({
      tenantId, keyword: data.keyword, category: data.category ?? null,
      assignToUserId: data.assignToUserId ?? null, setPriority: data.setPriority ?? null,
      priorityOrder: data.priorityOrder ?? 100, isActive: data.isActive ?? true,
    } as any) as unknown as EmailRoutingRule;
    return (this.ruleRepo.save(r) as unknown) as Promise<EmailRoutingRule>;
  }

  /**
   * Create a ticket from an inbound email. The first matching routing rule (by
   * priorityOrder) sets the category, priority, and assignee.
   */
  async createTicketFromEmail(tenantId: string, email: { from?: string; customerId?: string; subject: string; body?: string }): Promise<ServiceTicket> {
    if (!email.subject?.trim()) throw new BadRequestException('subject is required');
    const haystack = `${email.subject} ${email.body ?? ''}`.toLowerCase();
    const rules = (await this.ruleRepo.find({ where: { tenantId, isActive: true }, order: { priorityOrder: 'ASC' } }));
    const matched = rules.find((r) => haystack.includes(r.keyword.toLowerCase()));
    const count = await this.ticketRepo.count({ where: { tenantId } });
    const ticketNumber = `TKT-${String(count + 1).padStart(6, '0')}`;
    const ticket = this.ticketRepo.create({
      tenantId, ticketNumber, customerId: email.customerId ?? null, subject: email.subject,
      description: email.body ?? null, priority: matched?.setPriority ?? TicketPriority.MEDIUM,
      category: matched?.category ?? null, status: TicketStatus.OPEN,
      assignedToUserId: matched?.assignToUserId ?? null,
    } as any) as unknown as ServiceTicket;
    return (this.ticketRepo.save(ticket) as unknown) as Promise<ServiceTicket>;
  }

  // ─── Ph-231: self-service portal ──────────────────────────────────

  /** Customer-scoped ticket list for the self-service portal. */
  listCustomerTickets(tenantId: string, customerId: string): Promise<ServiceTicket[]> {
    return this.ticketRepo.find({ where: { tenantId, customerId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Portal ticket creation with KB deflection: returns suggested public
   * articles so the customer can self-resolve before submitting.
   */
  async portalCreateTicket(tenantId: string, data: { customerId: string; subject: string; body?: string }): Promise<any> {
    const deflection = await this.searchArticles(tenantId, data.subject, true);
    const ticket = await this.createTicketFromEmail(tenantId, { customerId: data.customerId, subject: data.subject, body: data.body });
    return { ticket, suggestedArticles: deflection.slice(0, 3).map((a) => ({ id: a.id, title: a.title })) };
  }

  // ─── Ph-232: SLA escalation automation ────────────────────────────

  /**
   * Find open tickets whose SLA resolution is imminent or breached as of `now`.
   * Tickets within `warnMinutes` of the due time are escalation candidates.
   */
  async slaEscalationCandidates(tenantId: string, now: string, warnMinutes = 60): Promise<any> {
    const nowMs = new Date(now).getTime();
    const open = await this.ticketRepo.find({ where: { tenantId } });
    const candidates = open
      .filter((t) => t.status !== TicketStatus.RESOLVED && t.status !== TicketStatus.CLOSED && t.slaResolutionDueAt)
      .map((t) => {
        const dueMs = new Date(t.slaResolutionDueAt as any).getTime();
        const minutesToDue = Math.round((dueMs - nowMs) / 60000);
        const state = minutesToDue < 0 ? 'BREACHED' : minutesToDue <= warnMinutes ? 'IMMINENT' : 'OK';
        return { ticketId: t.id, ticketNumber: t.ticketNumber, priority: t.priority, assignedToUserId: t.assignedToUserId, minutesToDue, state };
      })
      .filter((t) => t.state !== 'OK')
      .sort((a, b) => a.minutesToDue - b.minutesToDue);
    return { now, count: candidates.length, candidates };
  }

  /**
   * Escalate a ticket: bump priority, reassign to a manager, and flag the
   * breach for notification.
   */
  async escalateTicket(tenantId: string, id: string, managerUserId: string): Promise<any> {
    const ticket = await this.ticketRepo.findOne({ where: { id, tenantId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException('Cannot escalate a resolved/closed ticket');
    }
    const order = [TicketPriority.LOW, TicketPriority.MEDIUM, TicketPriority.HIGH, TicketPriority.CRITICAL];
    const idx = order.indexOf(ticket.priority);
    ticket.priority = order[Math.min(idx + 1, order.length - 1)];
    ticket.assignedToUserId = managerUserId;
    await this.ticketRepo.save(ticket);
    return { ticketId: ticket.id, newPriority: ticket.priority, reassignedTo: managerUserId, notify: managerUserId };
  }

  private async getArticle(tenantId: string, id: string): Promise<KbArticle> {
    const a = await this.kbRepo.findOne({ where: { id, tenantId } });
    if (!a) throw new NotFoundException('Article not found');
    return a;
  }
}
