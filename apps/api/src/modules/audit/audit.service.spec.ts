import { AuditService } from './audit.service';

/**
 * Audit log: writes persist the entry verbatim; findAll is tenant-scoped and
 * applies user/resource/action/date filters onto the query.
 */
describe('AuditService', () => {
  let service: AuditService;
  let repo: any, qb: any;

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'a1' }], 1]),
    };
    repo = {
      create: jest.fn((x) => ({ id: 'a1', ...x })),
      save: jest.fn((x) => Promise.resolve(x)),
      createQueryBuilder: jest.fn(() => qb),
    };
    service = new AuditService(repo);
  });

  it('log persists the entry', async () => {
    const entry = { tenantId: 't1', action: 'UPDATE', resourceType: 'user', userId: 'u1' };
    const saved = await service.log(entry as any);
    expect(repo.create).toHaveBeenCalledWith(entry);
    expect(saved.id).toBe('a1');
  });

  it('findAll scopes to the tenant and paginates', async () => {
    const r = await service.findAll('t1', { page: 2, limit: 10 } as any);
    expect(qb.where).toHaveBeenCalledWith('log.tenantId = :tenantId', { tenantId: 't1' });
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(r.items).toHaveLength(1);
  });

  it('findAll applies user/resource/action/date filters', async () => {
    const start = new Date('2026-01-01'); const end = new Date('2026-12-31');
    await service.findAll('t1', {} as any, {
      userId: 'u1', resourceType: 'invoice', action: 'DELETE', startDate: start, endDate: end,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('log.userId = :userId', { userId: 'u1' });
    expect(qb.andWhere).toHaveBeenCalledWith('log.resourceType = :resourceType', { resourceType: 'invoice' });
    expect(qb.andWhere).toHaveBeenCalledWith('log.action = :action', { action: 'DELETE' });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'log.createdAt BETWEEN :startDate AND :endDate',
      { startDate: start, endDate: end },
    );
  });
});
