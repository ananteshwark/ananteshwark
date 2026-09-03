import { NotFoundException } from '@nestjs/common';
import { CrmService } from './crm.service';

/**
 * CRM core: quote numbering, tenant-scoped lookups, the sales pipeline
 * aggregation (open stages only), and the conversion funnel by contact
 * status.
 */
describe('CrmService', () => {
  let service: CrmService;
  let contactRepo: any, opportunityRepo: any, activityRepo: any, quoteRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    remove: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(() => {
    contactRepo = mockRepo(); opportunityRepo = mockRepo(); activityRepo = mockRepo(); quoteRepo = mockRepo();
    service = new CrmService(contactRepo, opportunityRepo, activityRepo, quoteRepo);
  });

  it('createQuote numbers quotes sequentially per tenant', async () => {
    quoteRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: '12' }),
    });
    const q = await service.createQuote('t1', { title: 'Q3 deal' });
    expect(q.quoteNumber).toBe('QUOTE-000013');
  });

  it('getSalesPipeline aggregates open opportunities by stage (closed excluded)', async () => {
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { stage: 'QUALIFIED', count: '3', totalValue: '15000.50' },
        { stage: 'PROPOSAL', count: '1', totalValue: null },
      ]),
    };
    opportunityRepo.createQueryBuilder.mockReturnValue(qb);
    const pipeline = await service.getSalesPipeline('t1');
    expect(pipeline).toEqual([
      { stage: 'QUALIFIED', count: 3, totalValue: 15000.5 },
      { stage: 'PROPOSAL', count: 1, totalValue: 0 },
    ]);
    // closed stages excluded from the aggregation
    expect(qb.andWhere).toHaveBeenCalledWith(
      'o.stage NOT IN (:...closed)', expect.objectContaining({ closed: expect.arrayContaining(['CLOSED_WON', 'CLOSED_LOST']) }));
  });

  it('getConversionFunnel maps contact statuses to lowercase counts', async () => {
    contactRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { status: 'LEAD', count: '10' },
        { status: 'CUSTOMER', count: '4' },
      ]),
    });
    const funnel = await service.getConversionFunnel('t1', '2026-01-01', '2026-12-31');
    expect(funnel).toEqual({ lead: 10, customer: 4 });
  });

  it('lookups are tenant-scoped 404s across all entities', async () => {
    await expect(service.findContact('t2', 'x')).rejects.toThrow(NotFoundException);
    await expect(service.findOpportunity('t2', 'x')).rejects.toThrow(NotFoundException);
    await expect(service.findQuote('t2', 'x')).rejects.toThrow(NotFoundException);
    expect(contactRepo.findOne).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't2' } });
  });
});
