import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { And, Between, Equal, ILike, In, IsNull, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { ReportsService, OPS_BY_KIND } from './reports.service';
import { REPORT_CATALOG } from './report-catalog';
import { ALL_PERMISSIONS } from '../rbac/permissions.service';

/**
 * Metadata-driven report engine: every entity column becomes a typed,
 * operator-checked filter; queries are always tenant-scoped; sensitive
 * columns stay excluded from both output and filtering.
 */
const COLUMNS = [
  { propertyName: 'id', type: 'uuid', isPrimary: true },
  { propertyName: 'tenantId', type: String },
  { propertyName: 'firstName', type: String },
  { propertyName: 'status', type: 'enum', enum: ['ACTIVE', 'EXITED'] },
  { propertyName: 'dateOfJoining', type: 'date' },
  { propertyName: 'headcount', type: 'int' },
  { propertyName: 'remote', type: Boolean },
  { propertyName: 'metadataBlob', type: 'jsonb' },
  { propertyName: 'pan', type: String }, // excluded by the employees definition
  { propertyName: 'bankAccountNumber', type: String },
  { propertyName: 'createdAt', type: 'timestamp' },
];

const buildService = (permissions?: any) => {
  const repo = {
    metadata: { columns: COLUMNS },
    findAndCount: jest.fn().mockResolvedValue([[{ id: 'e1', firstName: 'Ann' }], 1]),
  };
  const dataSource: any = { getRepository: jest.fn().mockReturnValue(repo) };
  return { service: new ReportsService(dataSource, permissions), repo };
};

describe('report catalog integrity', () => {
  it('has unique codes and only real permissions', () => {
    const codes = REPORT_CATALOG.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const def of REPORT_CATALOG) {
      expect(ALL_PERMISSIONS).toContain(def.permission);
      expect(def.entity).toBeInstanceOf(Function);
      expect(def.module).toBeTruthy();
    }
  });

  it('covers the major business modules', () => {
    const modules = new Set(REPORT_CATALOG.map((r) => r.module));
    for (const m of ['hr', 'talent', 'finance', 'payroll', 'procurement', 'inventory', 'crm', 'sales', 'expenses', 'helpdesk', 'engagement', 'contracts', 'projects', 'knowledge', 'compensation', 'licensing']) {
      expect(modules.has(m)).toBe(true);
    }
  });
});

describe('column typing', () => {
  it('maps entity metadata to logical kinds', () => {
    expect(ReportsService.kindOf({ type: 'uuid' })).toBe('id');
    expect(ReportsService.kindOf({ type: String })).toBe('string');
    expect(ReportsService.kindOf({ type: 'numeric' })).toBe('number');
    expect(ReportsService.kindOf({ type: 'timestamp with time zone' })).toBe('date');
    expect(ReportsService.kindOf({ type: Boolean })).toBe('boolean');
    expect(ReportsService.kindOf({ type: 'enum', enum: ['A'] })).toBe('enum');
    expect(ReportsService.kindOf({ type: 'jsonb' })).toBe('json');
  });

  it('json columns expose no filter operators', () => {
    expect(OPS_BY_KIND.json).toEqual([]);
  });
});

describe('describe', () => {
  it('returns typed columns with operators, minus excluded sensitive fields', async () => {
    const { service } = buildService();
    const d = await service.describe('u1', 't1', 'hr-employees');
    const fields = d.columns.map((c: any) => c.field);
    expect(fields).toContain('firstName');
    expect(fields).not.toContain('pan');
    expect(fields).not.toContain('bankAccountNumber');
    const status = d.columns.find((c: any) => c.field === 'status');
    expect(status).toMatchObject({ kind: 'enum', enumValues: ['ACTIVE', 'EXITED'] });
    expect(status.operators).toContain('in');
  });

  it('404s an unknown report code', async () => {
    const { service } = buildService();
    await expect(service.describe('u1', 't1', 'nope')).rejects.toThrow(NotFoundException);
  });
});

describe('run', () => {
  it('always scopes to the tenant and selects only visible columns', async () => {
    const { service, repo } = buildService();
    await service.run('u1', 't1', 'hr-employees', {});
    const args = repo.findAndCount.mock.calls[0][0];
    expect(args.where.tenantId).toBe('t1');
    expect(args.select).not.toContain('pan');
    expect(args.select).toContain('firstName');
    expect(args.order).toEqual({ createdAt: 'DESC' });
  });

  it('maps operators per type: contains→ILike, between→Between, in→In', async () => {
    const { service, repo } = buildService();
    await service.run('u1', 't1', 'hr-employees', {
      filters: [
        { field: 'firstName', op: 'contains', value: 'ann' },
        { field: 'headcount', op: 'between', value: [1, 10] },
        { field: 'status', op: 'in', value: 'ACTIVE' }, // scalar coerced to array
      ],
    });
    const where = repo.findAndCount.mock.calls[0][0].where;
    expect(where.firstName).toEqual(ILike('%ann%'));
    expect(where.headcount).toEqual(Between(1, 10));
    expect(where.status).toEqual(In(['ACTIVE']));
  });

  it('combines multiple filters on one field with And (date range)', async () => {
    const { service, repo } = buildService();
    await service.run('u1', 't1', 'hr-employees', {
      filters: [
        { field: 'dateOfJoining', op: 'gte', value: '2024-01-01' },
        { field: 'dateOfJoining', op: 'lte', value: '2024-12-31' },
      ],
    });
    const where = repo.findAndCount.mock.calls[0][0].where;
    expect(where.dateOfJoining).toEqual(And(MoreThanOrEqual('2024-01-01'), LessThanOrEqual('2024-12-31')));
  });

  it('rejects unknown fields, wrong-type operators, excluded fields and manual tenant filters', async () => {
    const { service } = buildService();
    await expect(service.run('u1', 't1', 'hr-employees', { filters: [{ field: 'ghost', op: 'eq', value: 1 }] })).rejects.toThrow(BadRequestException);
    await expect(service.run('u1', 't1', 'hr-employees', { filters: [{ field: 'remote', op: 'contains', value: 'x' }] })).rejects.toThrow(BadRequestException);
    await expect(service.run('u1', 't1', 'hr-employees', { filters: [{ field: 'metadataBlob', op: 'eq', value: 1 }] })).rejects.toThrow(BadRequestException);
    await expect(service.run('u1', 't1', 'hr-employees', { filters: [{ field: 'pan', op: 'eq', value: 'x' }] })).rejects.toThrow(BadRequestException);
    await expect(service.run('u1', 't1', 'hr-employees', { filters: [{ field: 'tenantId', op: 'eq', value: 'other' }] })).rejects.toThrow(BadRequestException);
  });

  it('requires values where the operator needs them, and allows null checks without', async () => {
    const { service, repo } = buildService();
    await expect(service.run('u1', 't1', 'hr-employees', { filters: [{ field: 'firstName', op: 'eq' }] })).rejects.toThrow(BadRequestException);
    await expect(service.run('u1', 't1', 'hr-employees', { filters: [{ field: 'headcount', op: 'between', value: [1] }] })).rejects.toThrow(BadRequestException);
    await service.run('u1', 't1', 'hr-employees', { filters: [{ field: 'dateOfJoining', op: 'isNull' }] });
    expect(repo.findAndCount.mock.calls[0][0].where.dateOfJoining).toEqual(IsNull());
  });

  it('clamps pagination and validates the sort field', async () => {
    const { service, repo } = buildService();
    await service.run('u1', 't1', 'hr-employees', { page: 0, limit: 99999, sortBy: 'firstName', sortDir: 'ASC' });
    const args = repo.findAndCount.mock.calls[0][0];
    expect(args.take).toBe(500);
    expect(args.skip).toBe(0);
    expect(args.order).toEqual({ firstName: 'ASC' });
    await expect(service.run('u1', 't1', 'hr-employees', { sortBy: 'pan' })).rejects.toThrow(BadRequestException);
  });

  it('enforces the report definition permission dynamically', async () => {
    const permissions = { userHasPermission: jest.fn().mockResolvedValue(false) };
    const { service } = buildService(permissions);
    await expect(service.run('u1', 't1', 'hr-employees', {})).rejects.toThrow(ForbiddenException);
    expect(permissions.userHasPermission).toHaveBeenCalledWith('u1', 't1', 'hr:employees:read');
  });
});

describe('catalog + export', () => {
  it('catalogFor lists only reports the user can run, grouped by module', async () => {
    const permissions = {
      userHasPermission: jest.fn(async (_u: string, _t: string, perm: string) => perm === 'hr:employees:read'),
    };
    const { service } = buildService(permissions);
    const cat = await service.catalogFor('u1', 't1');
    expect(cat.total).toBe(2); // employees + exits both use hr:employees:read
    expect(cat.data).toHaveLength(1);
    expect(cat.data[0].module).toBe('hr');
    expect((cat.data[0].reports[0] as any).entity).toBeUndefined(); // classes never serialized out
  });

  it('CSV escapes commas, quotes, newlines, objects and nulls', () => {
    const csv = ReportsService.toCsv(
      [{ a: 'x,y', b: 'He said "hi"', c: 'line1\nline2', d: null, e: { k: 1 } }],
      ['a', 'b', 'c', 'd', 'e'],
    );
    const [header, row] = csv.split('\n', 2);
    expect(header).toBe('a,b,c,d,e');
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('"He said ""hi"""');
    expect(csv).toContain('"line1\nline2"');
    expect(row.endsWith(',"{""k"":1}"')).toBe(false); // object serialized, null empty — order preserved
    expect(csv).toContain(',,'); // the null cell
  });

  it('exportCsv paginates through results up to the cap', async () => {
    const { service, repo } = buildService();
    repo.findAndCount
      .mockResolvedValueOnce([[{ id: '1', firstName: 'A' }], 2])
      .mockResolvedValueOnce([[{ id: '2', firstName: 'B' }], 2]);
    const { csv, filename } = await service.exportCsv('u1', 't1', 'hr-employees', {});
    expect(filename).toMatch(/^hr-employees-/);
    expect(csv.split('\n')).toHaveLength(3); // header + 2 rows
  });
});
