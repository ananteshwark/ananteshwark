import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ServiceDeskService } from './service-desk.service';
import { KbArticle, ArticleStatus, ArticleVisibility } from './entities/kb-article.entity';
import { EmailRoutingRule } from './entities/email-routing-rule.entity';
import { ServiceTicket, TicketPriority, TicketStatus } from '../entities/service-ticket.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('ServiceDeskService — Phase 229-232', () => {
  let service: ServiceDeskService;
  let kbRepo: any, ruleRepo: any, ticketRepo: any;

  beforeEach(async () => {
    kbRepo = mockRepo(); ruleRepo = mockRepo(); ticketRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        ServiceDeskService,
        { provide: getRepositoryToken(KbArticle), useValue: kbRepo },
        { provide: getRepositoryToken(EmailRoutingRule), useValue: ruleRepo },
        { provide: getRepositoryToken(ServiceTicket), useValue: ticketRepo },
      ],
    }).compile();
    service = module.get(ServiceDeskService);
  });

  // ─── Ph-229: knowledge base ───────────────────────────────────────

  it('createArticle — requires title and body', async () => {
    await expect(service.createArticle('t1', { title: '', body: '' })).rejects.toThrow(BadRequestException);
  });

  it('searchArticles — matches term and ranks by net helpful, publicOnly filters', async () => {
    kbRepo.find.mockResolvedValue([
      { id: 'a1', title: 'Reset password', body: 'how to reset', tags: [], visibility: ArticleVisibility.PUBLIC, status: ArticleStatus.PUBLISHED, helpfulCount: 10, notHelpfulCount: 1 },
      { id: 'a2', title: 'Password policy', body: 'internal note', tags: ['password'], visibility: ArticleVisibility.INTERNAL, status: ArticleStatus.PUBLISHED, helpfulCount: 2, notHelpfulCount: 0 },
    ]);
    const pub = await service.searchArticles('t1', 'password', true);
    expect(pub).toHaveLength(1);
    expect(pub[0].id).toBe('a1');
    const all = await service.searchArticles('t1', 'password', false);
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe('a1'); // higher net helpful first
  });

  it('rateArticle — increments helpful count', async () => {
    kbRepo.findOne.mockResolvedValue({ id: 'a1', helpfulCount: 0, notHelpfulCount: 0 });
    kbRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const a = await service.rateArticle('t1', 'a1', true);
    expect(a.helpfulCount).toBe(1);
  });

  // ─── Ph-230: email-to-ticket ──────────────────────────────────────

  it('createTicketFromEmail — applies first matching routing rule', async () => {
    ruleRepo.find.mockResolvedValue([
      { keyword: 'invoice', category: 'Billing', assignToUserId: 'u-bill', setPriority: TicketPriority.HIGH, priorityOrder: 1 },
      { keyword: 'crash', category: 'Tech', assignToUserId: 'u-tech', setPriority: TicketPriority.CRITICAL, priorityOrder: 2 },
    ]);
    ticketRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const t = await service.createTicketFromEmail('t1', { subject: 'Problem with my invoice', body: 'help' });
    expect(t.category).toBe('Billing');
    expect(t.assignedToUserId).toBe('u-bill');
    expect(t.priority).toBe(TicketPriority.HIGH);
  });

  it('createTicketFromEmail — defaults when no rule matches', async () => {
    ruleRepo.find.mockResolvedValue([{ keyword: 'invoice', category: 'Billing', priorityOrder: 1 }]);
    ticketRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const t = await service.createTicketFromEmail('t1', { subject: 'General question' });
    expect(t.priority).toBe(TicketPriority.MEDIUM);
    expect(t.category).toBeNull();
  });

  // ─── Ph-231: self-service portal ──────────────────────────────────

  it('portalCreateTicket — returns ticket plus deflection suggestions', async () => {
    kbRepo.find.mockResolvedValue([
      { id: 'a1', title: 'Reset password steps', body: 'x', tags: [], visibility: ArticleVisibility.PUBLIC, status: ArticleStatus.PUBLISHED, helpfulCount: 5, notHelpfulCount: 0 },
    ]);
    ruleRepo.find.mockResolvedValue([]);
    ticketRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.portalCreateTicket('t1', { customerId: 'c1', subject: 'reset password' });
    expect(r.ticket).toBeDefined();
    expect(r.suggestedArticles).toHaveLength(1);
    expect(r.suggestedArticles[0].title).toBe('Reset password steps');
  });

  // ─── Ph-232: SLA escalation ───────────────────────────────────────

  it('slaEscalationCandidates — flags imminent and breached, skips OK/closed', async () => {
    ticketRepo.find.mockResolvedValue([
      { id: 't1', ticketNumber: 'TKT-1', priority: 'HIGH', status: TicketStatus.OPEN, slaResolutionDueAt: '2026-06-30T10:30:00Z' }, // 30 min out → imminent
      { id: 't2', ticketNumber: 'TKT-2', priority: 'LOW', status: TicketStatus.OPEN, slaResolutionDueAt: '2026-06-30T09:00:00Z' }, // past → breached
      { id: 't3', ticketNumber: 'TKT-3', priority: 'LOW', status: TicketStatus.OPEN, slaResolutionDueAt: '2026-06-30T20:00:00Z' }, // far → OK
      { id: 't4', ticketNumber: 'TKT-4', priority: 'LOW', status: TicketStatus.CLOSED, slaResolutionDueAt: '2026-06-30T09:00:00Z' }, // closed → skip
    ]);
    const r = await service.slaEscalationCandidates('t1', '2026-06-30T10:00:00Z', 60);
    expect(r.count).toBe(2);
    expect(r.candidates[0].state).toBe('BREACHED'); // sorted by minutesToDue asc
    expect(r.candidates.find((c: any) => c.ticketId === 't1').state).toBe('IMMINENT');
  });

  it('escalateTicket — bumps priority and reassigns', async () => {
    ticketRepo.findOne.mockResolvedValue({ id: 't1', priority: TicketPriority.MEDIUM, status: TicketStatus.OPEN, assignedToUserId: 'agent' });
    ticketRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.escalateTicket('t1', 't1', 'mgr-1');
    expect(r.newPriority).toBe(TicketPriority.HIGH);
    expect(r.reassignedTo).toBe('mgr-1');
  });

  it('escalateTicket — rejects closed ticket', async () => {
    ticketRepo.findOne.mockResolvedValue({ id: 't1', priority: TicketPriority.LOW, status: TicketStatus.CLOSED });
    await expect(service.escalateTicket('t1', 't1', 'mgr-1')).rejects.toThrow(BadRequestException);
  });
});
