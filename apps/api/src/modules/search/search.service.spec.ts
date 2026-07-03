import { SearchService } from './search.service';

/**
 * Global search: minimum term length, tenant scoping on every source, group
 * shaping, per-type limits, and resilience when one source throws.
 */
describe('SearchService', () => {
  let service: SearchService;
  let employeeRepo: any, vendorRepo: any, billRepo: any, customerRepo: any,
    invoiceRepo: any, poRepo: any, ticketRepo: any, itemRepo: any;

  const mockRepo = () => ({ find: jest.fn().mockResolvedValue([]) });

  beforeEach(() => {
    employeeRepo = mockRepo(); vendorRepo = mockRepo(); billRepo = mockRepo();
    customerRepo = mockRepo(); invoiceRepo = mockRepo(); poRepo = mockRepo();
    ticketRepo = mockRepo(); itemRepo = mockRepo();
    service = new SearchService(
      employeeRepo, vendorRepo, billRepo, customerRepo,
      invoiceRepo, poRepo, ticketRepo, itemRepo,
    );
  });

  it('returns nothing for a term shorter than 2 chars and never hits the DB', async () => {
    expect(await service.globalSearch('t1', 'a')).toEqual([]);
    expect(await service.globalSearch('t1', '  ')).toEqual([]);
    expect(employeeRepo.find).not.toHaveBeenCalled();
  });

  it('groups matches by type with title/subtitle/route', async () => {
    employeeRepo.find.mockResolvedValue([
      { id: 'e1', firstName: 'Ada', lastName: 'Lovelace', employeeCode: 'EMP-1', email: 'ada@x.com' },
    ]);
    itemRepo.find.mockResolvedValue([{ id: 'i1', name: 'Adapter', code: 'ITM-9' }]);

    const groups = await service.globalSearch('t1', 'ada');
    expect(groups.map((g) => g.type)).toEqual(['employee', 'item']);
    expect(groups[0].results[0]).toEqual({
      id: 'e1', title: 'Ada Lovelace', subtitle: 'EMP-1 • ada@x.com', route: '/hr/employees',
    });
    expect(groups[1].results[0].route).toBe('/inventory');
  });

  it('scopes every source to the tenant and applies the per-type limit', async () => {
    await service.globalSearch('t9', 'test', 3);
    for (const repo of [employeeRepo, vendorRepo, billRepo, customerRepo, invoiceRepo, poRepo, ticketRepo, itemRepo]) {
      const arg = repo.find.mock.calls[0][0];
      expect(arg.take).toBe(3);
      for (const w of arg.where) expect(w.tenantId).toBe('t9');
    }
  });

  it('omits empty groups entirely', async () => {
    const groups = await service.globalSearch('t1', 'nothing-matches');
    expect(groups).toEqual([]);
  });

  it('a throwing source is skipped without breaking the rest', async () => {
    vendorRepo.find.mockRejectedValue(new Error('column missing'));
    customerRepo.find.mockResolvedValue([{ id: 'c1', name: 'Acme', code: 'CUST-1' }]);
    const groups = await service.globalSearch('t1', 'acme');
    expect(groups.map((g) => g.type)).toEqual(['customer']);
  });
});
