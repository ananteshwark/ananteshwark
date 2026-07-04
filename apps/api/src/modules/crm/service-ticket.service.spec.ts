import { NotFoundException } from '@nestjs/common';
import { ServiceTicketService } from './service-ticket.service';
import { TicketPriority, TicketStatus } from './entities/service-ticket.entity';

/**
 * Service tickets: SLA due dates from policy (or priority defaults),
 * first-response stamping on status change / first comment, resolution
 * stamping, and breach recomputation against the resolution deadline.
 */
describe('ServiceTicketService', () => {
  let service: ServiceTicketService;
  let ticketRepo: any, slaRepo: any, commentRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: '6' }),
    })),
  });

  beforeEach(() => {
    ticketRepo = mockRepo(); slaRepo = mockRepo(); commentRepo = mockRepo();
    service = new ServiceTicketService(ticketRepo, slaRepo, commentRepo);
  });

  it('createTicket numbers the ticket and applies CRITICAL default SLA (30m/240m)', async () => {
    const before = Date.now();
    const t = await service.createTicket('t1', { subject: 'down', priority: TicketPriority.CRITICAL });
    expect(t.ticketNumber).toBe('TKT-0007');
    const responseMins = (t.slaResponseDueAt.getTime() - before) / 60000;
    const resolutionMins = (t.slaResolutionDueAt.getTime() - before) / 60000;
    expect(responseMins).toBeGreaterThan(29); expect(responseMins).toBeLessThan(31);
    expect(resolutionMins).toBeGreaterThan(239); expect(resolutionMins).toBeLessThan(241);
  });

  it('an active tenant SLA policy overrides the defaults', async () => {
    slaRepo.findOne.mockResolvedValue({ responseMinutes: 10, resolutionMinutes: 60 });
    const before = Date.now();
    const t = await service.createTicket('t1', { subject: 'x', priority: TicketPriority.LOW });
    expect((t.slaResponseDueAt.getTime() - before) / 60000).toBeCloseTo(10, 0);
    expect((t.slaResolutionDueAt.getTime() - before) / 60000).toBeCloseTo(60, 0);
  });

  it('the first status change off OPEN stamps firstResponseAt', async () => {
    const ticket: any = { id: 'tk1', tenantId: 't1', status: TicketStatus.OPEN, firstResponseAt: null, slaResolutionDueAt: new Date(Date.now() + 60000) };
    ticketRepo.findOne.mockResolvedValue(ticket);
    await service.updateStatus('t1', 'tk1', TicketStatus.IN_PROGRESS);
    expect(ticket.firstResponseAt).toBeInstanceOf(Date);
    expect(ticket.status).toBe(TicketStatus.IN_PROGRESS);
  });

  it('resolving within the SLA is not a breach; resolving late is', async () => {
    const onTime: any = {
      id: 'tk1', tenantId: 't1', status: TicketStatus.IN_PROGRESS,
      firstResponseAt: new Date(), resolvedAt: null,
      slaResolutionDueAt: new Date(Date.now() + 60 * 60000),
    };
    ticketRepo.findOne.mockResolvedValue(onTime);
    await service.updateStatus('t1', 'tk1', TicketStatus.RESOLVED);
    expect(onTime.resolvedAt).toBeInstanceOf(Date);
    expect(onTime.slaBreached).toBe(false);

    const late: any = {
      id: 'tk2', tenantId: 't1', status: TicketStatus.IN_PROGRESS,
      firstResponseAt: new Date(), resolvedAt: null,
      slaResolutionDueAt: new Date(Date.now() - 60 * 60000), // already past due
    };
    ticketRepo.findOne.mockResolvedValue(late);
    await service.updateStatus('t1', 'tk2', TicketStatus.RESOLVED);
    expect(late.slaBreached).toBe(true);
  });

  it('the first comment stamps firstResponseAt exactly once', async () => {
    const ticket: any = { id: 'tk1', tenantId: 't1', firstResponseAt: null };
    ticketRepo.findOne.mockResolvedValue(ticket);
    await service.addComment('t1', 'tk1', 'agent-1', { body: 'looking into it' });
    expect(ticket.firstResponseAt).toBeInstanceOf(Date);
    const stamped = ticket.firstResponseAt;

    await service.addComment('t1', 'tk1', 'agent-1', { body: 'update' });
    expect(ticket.firstResponseAt).toBe(stamped); // unchanged
    expect(commentRepo.create).toHaveBeenLastCalledWith(expect.objectContaining({ isInternal: false }));
  });

  it('lookups are tenant-scoped 404s', async () => {
    await expect(service.getTicket('t2', 'ghost')).rejects.toThrow(NotFoundException);
    expect(ticketRepo.findOne).toHaveBeenCalledWith({ where: { id: 'ghost', tenantId: 't2' } });
  });
});
