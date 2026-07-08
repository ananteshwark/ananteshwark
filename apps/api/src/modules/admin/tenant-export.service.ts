import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Tenant } from '../tenants/entities/tenant.entity';

const MAX_ROWS_PER_TABLE = 50_000;

/**
 * Portable tenant backup / offboarding export (runbook §3). Walks the entity
 * metadata for every table carrying a tenant_id column and extracts that
 * tenant's rows — so new modules are exported automatically the moment their
 * entities register, with no list to maintain.
 */
@Injectable()
export class TenantExportService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly dataSource: DataSource,
  ) {}

  /** Tables that carry tenant-scoped data, discovered from entity metadata. */
  tenantScopedTables(): string[] {
    const tables = new Set<string>();
    for (const meta of this.dataSource.entityMetadatas) {
      const hasTenantColumn = meta.columns.some((c) => c.databaseName === 'tenant_id');
      if (hasTenantColumn) tables.add(meta.tableName);
    }
    return Array.from(tables).sort();
  }

  async export(tenantId: string): Promise<{
    tenant: { id: string; name: string; slug: string };
    exportedAt: string;
    tables: Record<string, { rowCount: number; truncated: boolean; rows: any[] }>;
  }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    const tables: Record<string, { rowCount: number; truncated: boolean; rows: any[] }> = {};
    for (const table of this.tenantScopedTables()) {
      try {
        const rows: any[] = await this.dataSource.query(
          `SELECT * FROM "${table}" WHERE tenant_id = $1 LIMIT ${MAX_ROWS_PER_TABLE + 1}`,
          [tenantId],
        );
        const truncated = rows.length > MAX_ROWS_PER_TABLE;
        const kept = truncated ? rows.slice(0, MAX_ROWS_PER_TABLE) : rows;
        if (kept.length > 0) {
          tables[table] = { rowCount: kept.length, truncated, rows: kept };
        }
      } catch {
        // A table that exists in metadata but not yet in this database
        // (pre-migration) must not abort the rest of the export.
        tables[table] = { rowCount: 0, truncated: false, rows: [] };
      }
    }

    return {
      tenant: { id: tenant.id, name: (tenant as any).name, slug: (tenant as any).slug },
      exportedAt: new Date().toISOString(),
      tables,
    };
  }

  /** Row counts only — cheap preview before pulling a full archive. */
  async summary(tenantId: string): Promise<{ tables: Array<{ table: string; rowCount: number }> }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
    const result: Array<{ table: string; rowCount: number }> = [];
    for (const table of this.tenantScopedTables()) {
      try {
        const [{ count }] = await this.dataSource.query(
          `SELECT COUNT(*)::int AS count FROM "${table}" WHERE tenant_id = $1`,
          [tenantId],
        );
        if (Number(count) > 0) result.push({ table, rowCount: Number(count) });
      } catch {
        /* table not present yet */
      }
    }
    return { tables: result.sort((a, b) => b.rowCount - a.rowCount) };
  }
}
