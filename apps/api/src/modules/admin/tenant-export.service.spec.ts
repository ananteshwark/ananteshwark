import { NotFoundException } from '@nestjs/common';
import { TenantExportService } from './tenant-export.service';

describe('TenantExportService', () => {
  const tenantRepo: any = { findOne: jest.fn() };
  const meta = (tableName: string, columns: string[]) => ({
    tableName,
    columns: columns.map((c) => ({ databaseName: c })),
  });
  let dataSource: any;
  let service: TenantExportService;

  beforeEach(() => {
    tenantRepo.findOne.mockResolvedValue({ id: 't1', name: 'Acme', slug: 'acme' });
    dataSource = {
      entityMetadatas: [
        meta('hr_employees', ['id', 'tenant_id', 'first_name']),
        meta('exp_claims', ['id', 'tenant_id', 'total_amount']),
        meta('typeorm_migrations', ['id', 'timestamp']),        // no tenant_id → excluded
        meta('scheduler_leases', ['name', 'holder_id']),        // no tenant_id → excluded
      ],
      query: jest.fn(),
    };
    service = new TenantExportService(tenantRepo, dataSource);
  });

  it('discovers only tenant-scoped tables from entity metadata', () => {
    expect(service.tenantScopedTables()).toEqual(['exp_claims', 'hr_employees']);
  });

  it('exports rows per table, parameterized by tenant, skipping empty tables', async () => {
    dataSource.query.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('hr_employees') ? [{ id: 'e1', tenant_id: 't1' }] : []));
    const result = await service.export('t1');
    expect(result.tenant).toEqual({ id: 't1', name: 'Acme', slug: 'acme' });
    expect(Object.keys(result.tables)).toEqual(['hr_employees']); // empty exp_claims omitted
    expect(result.tables.hr_employees.rowCount).toBe(1);
    // every query is tenant-parameterized
    for (const call of dataSource.query.mock.calls) {
      expect(call[0]).toContain('WHERE tenant_id = $1');
      expect(call[1]).toEqual(['t1']);
    }
  });

  it('a missing table never aborts the rest of the export', async () => {
    dataSource.query.mockImplementation((sql: string) =>
      sql.includes('exp_claims')
        ? Promise.reject(new Error('relation does not exist'))
        : Promise.resolve([{ id: 'e1' }]));
    const result = await service.export('t1');
    expect(result.tables.hr_employees.rowCount).toBe(1);
    expect(result.tables.exp_claims).toEqual({ rowCount: 0, truncated: false, rows: [] });
  });

  it('marks truncation when a table exceeds the row cap', async () => {
    const big = Array.from({ length: 50_001 }, (_, i) => ({ id: i }));
    dataSource.query.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('hr_employees') ? big : []));
    const result = await service.export('t1');
    expect(result.tables.hr_employees.truncated).toBe(true);
    expect(result.tables.hr_employees.rowCount).toBe(50_000);
  });

  it('summary returns non-zero row counts sorted desc; unknown tenant 404s', async () => {
    dataSource.query.mockImplementation((sql: string) =>
      Promise.resolve([{ count: sql.includes('hr_employees') ? 7 : 0 }]));
    const result = await service.summary('t1');
    expect(result.tables).toEqual([{ table: 'hr_employees', rowCount: 7 }]);

    tenantRepo.findOne.mockResolvedValue(null);
    await expect(service.export('nope')).rejects.toThrow(NotFoundException);
  });
});
