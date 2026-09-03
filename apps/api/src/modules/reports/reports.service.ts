import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  And,
  Between,
  DataSource,
  Equal,
  ILike,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { PermissionsService } from '../rbac/permissions.service';
import { REPORT_BY_CODE, REPORT_CATALOG, ReportDefinition } from './report-catalog';
import { ReportView } from './entities/report-view.entity';

export type ColumnKind = 'id' | 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'json';
export type FilterOp = 'eq' | 'neq' | 'in' | 'contains' | 'gte' | 'lte' | 'between' | 'isNull' | 'notNull';

export interface ReportFilter {
  field: string;
  op: FilterOp;
  value?: any;
}

export interface RunQuery {
  filters?: ReportFilter[];
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
}

export const OPS_BY_KIND: Record<ColumnKind, FilterOp[]> = {
  id: ['eq', 'in', 'isNull', 'notNull'],
  string: ['eq', 'neq', 'contains', 'in', 'isNull', 'notNull'],
  number: ['eq', 'neq', 'gte', 'lte', 'between', 'isNull', 'notNull'],
  date: ['eq', 'gte', 'lte', 'between', 'isNull', 'notNull'],
  boolean: ['eq'],
  enum: ['eq', 'neq', 'in', 'isNull', 'notNull'],
  json: [],
};

const NUMBER_TYPES = new Set(['int', 'int2', 'int4', 'int8', 'integer', 'smallint', 'bigint', 'numeric', 'decimal', 'float', 'double precision', 'real', 'number']);
const DATE_TYPES = new Set(['date', 'datetime', 'timestamp', 'timestamptz', 'timestamp with time zone', 'timestamp without time zone', 'time']);
const JSON_TYPES = new Set(['json', 'jsonb', 'simple-json', 'simple-array']);

const MAX_PAGE_SIZE = 500;
const EXPORT_LIMIT = 10_000;

/**
 * Metadata-driven report engine over the declarative REPORT_CATALOG. Column
 * shapes come from TypeORM entity metadata at runtime, so every column of a
 * report's entity is filterable and sortable with type-aware operators —
 * nothing is hand-listed per report. All queries are tenant-scoped (entities
 * without a tenantId column are refused outright) and per-report access is
 * checked dynamically against the definition's permission string.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly permissions?: PermissionsService,
    @Optional() @InjectRepository(ReportView)
    private readonly viewRepo?: Repository<ReportView>,
  ) {}

  static kindOf(column: { type: any; enum?: any[]; isPrimary?: boolean; propertyName?: string }): ColumnKind {
    if (column.enum?.length) return 'enum';
    const raw = typeof column.type === 'function' ? column.type.name.toLowerCase() : String(column.type).toLowerCase();
    if (raw === 'uuid' || column.isPrimary) return 'id';
    if (NUMBER_TYPES.has(raw)) return 'number';
    if (DATE_TYPES.has(raw) || column.type === Date) return 'date';
    if (raw === 'boolean' || raw === 'bool') return 'boolean';
    if (JSON_TYPES.has(raw)) return 'json';
    return 'string';
  }

  private async assertAllowed(userId: string, tenantId: string, def: ReportDefinition): Promise<void> {
    if (!this.permissions) return; // positional unit-test construction
    const ok = await this.permissions.userHasPermission(userId, tenantId, def.permission);
    if (!ok) throw new ForbiddenException(`Missing permission: ${def.permission}`);
  }

  private definition(code: string): ReportDefinition {
    const def = REPORT_BY_CODE.get(code);
    if (!def) throw new NotFoundException(`Unknown report '${code}'`);
    return def;
  }

  private columnsOf(def: ReportDefinition) {
    const excluded = new Set(def.excludeColumns ?? []);
    const metadata = this.dataSource.getRepository(def.entity as any).metadata;
    return metadata.columns
      .filter((c: any) => !excluded.has(c.propertyName))
      .map((c: any) => ({
        field: c.propertyName,
        kind: ReportsService.kindOf(c),
        enumValues: c.enum?.length ? c.enum.map(String) : undefined,
      }));
  }

  /** Reports the user may run, grouped by module. */
  async catalogFor(userId: string, tenantId: string): Promise<{ data: Array<{ module: string; reports: Array<Omit<ReportDefinition, 'entity' | 'excludeColumns'>> }>; total: number }> {
    const allowed: ReportDefinition[] = [];
    for (const def of REPORT_CATALOG) {
      if (!this.permissions) { allowed.push(def); continue; }
      if (await this.permissions.userHasPermission(userId, tenantId, def.permission)) allowed.push(def);
    }
    const modules = [...new Set(allowed.map((d) => d.module))];
    const data = modules.map((module) => ({
      module,
      reports: allowed
        .filter((d) => d.module === module)
        .map(({ entity: _entity, excludeColumns: _x, ...rest }) => rest),
    }));
    return { data, total: allowed.length };
  }

  /** Read-only display columns produced by the definition's lookups. */
  private static labelColumns(def: ReportDefinition) {
    return (def.lookups ?? []).map((l) => ({
      field: `${l.field}Label`,
      kind: 'string' as ColumnKind,
      enumValues: undefined as string[] | undefined,
      operators: [] as FilterOp[],
    }));
  }

  /** Column shapes + the operators each supports, for building filter UIs. */
  async describe(userId: string, tenantId: string, code: string) {
    const def = this.definition(code);
    await this.assertAllowed(userId, tenantId, def);
    const columns = [
      ...this.columnsOf(def).map((c) => ({ ...c, operators: OPS_BY_KIND[c.kind] })),
      ...ReportsService.labelColumns(def),
    ];
    return { code: def.code, module: def.module, name: def.name, description: def.description, columns };
  }

  /**
   * Attach `<field>Label` display values by batch-resolving the distinct
   * IDs in the page against the lookup entity (tenant-scoped). Best-effort:
   * a failed lookup leaves the label blank rather than failing the report.
   */
  private async enrich(def: ReportDefinition, tenantId: string, rows: any[]): Promise<void> {
    for (const lookup of def.lookups ?? []) {
      const ids = [...new Set(rows.map((r) => r[lookup.field]).filter(Boolean))];
      if (!ids.length) continue;
      try {
        const repo = this.dataSource.getRepository(lookup.entity as any);
        const refs = await repo.find({
          where: { tenantId, id: In(ids) } as any,
          select: ['id', ...lookup.labelFields] as any,
        });
        const labels = new Map(
          refs.map((ref: any) => [ref.id, lookup.labelFields.map((f) => ref[f]).filter(Boolean).join(' ')]),
        );
        for (const row of rows) {
          row[`${lookup.field}Label`] = row[lookup.field] ? labels.get(row[lookup.field]) ?? null : null;
        }
      } catch {
        for (const row of rows) row[`${lookup.field}Label`] = null;
      }
    }
  }

  private static operatorFor(filter: ReportFilter, kind: ColumnKind): any {
    const requireValue = () => {
      if (filter.value === undefined || filter.value === null || filter.value === '') {
        throw new BadRequestException(`Filter on '${filter.field}' (${filter.op}) requires a value`);
      }
    };
    switch (filter.op) {
      case 'eq': requireValue(); return Equal(filter.value);
      case 'neq': requireValue(); return Not(Equal(filter.value));
      case 'in': {
        requireValue();
        const values = Array.isArray(filter.value) ? filter.value : [filter.value];
        if (!values.length) throw new BadRequestException(`Filter on '${filter.field}' (in) requires at least one value`);
        return In(values);
      }
      case 'contains': requireValue(); return ILike(`%${String(filter.value)}%`);
      case 'gte': requireValue(); return MoreThanOrEqual(filter.value);
      case 'lte': requireValue(); return LessThanOrEqual(filter.value);
      case 'between': {
        if (!Array.isArray(filter.value) || filter.value.length !== 2) {
          throw new BadRequestException(`Filter on '${filter.field}' (between) requires [from, to]`);
        }
        return Between(filter.value[0], filter.value[1]);
      }
      case 'isNull': return IsNull();
      case 'notNull': return Not(IsNull());
      default:
        throw new BadRequestException(`Unknown operator '${filter.op}'`);
    }
  }

  private buildWhere(def: ReportDefinition, tenantId: string, filters: ReportFilter[], columns: Array<{ field: string; kind: ColumnKind }>) {
    const byField = new Map(columns.map((c) => [c.field, c]));
    if (!byField.has('tenantId')) {
      throw new BadRequestException(`Report '${def.code}' is not tenant-scoped and cannot be run`);
    }
    const grouped = new Map<string, any[]>();
    for (const filter of filters ?? []) {
      const column = byField.get(filter.field);
      if (!column) throw new BadRequestException(`Unknown or unavailable filter field '${filter.field}'`);
      if (filter.field === 'tenantId') throw new BadRequestException('tenantId is scoped automatically');
      if (!OPS_BY_KIND[column.kind].includes(filter.op)) {
        throw new BadRequestException(`Operator '${filter.op}' is not valid for ${column.kind} field '${filter.field}'`);
      }
      const ops = grouped.get(filter.field) ?? [];
      ops.push(ReportsService.operatorFor(filter, column.kind));
      grouped.set(filter.field, ops);
    }
    const where: Record<string, any> = { tenantId };
    for (const [field, ops] of grouped) {
      where[field] = ops.length === 1 ? ops[0] : And(...ops);
    }
    return where;
  }

  /**
   * Shared setup for running a report: permission check, column/filter/sort
   * resolution. Extracted so exports can reuse it without going through
   * paginated run() calls.
   */
  private async prepare(userId: string, tenantId: string, code: string, query: RunQuery) {
    const def = this.definition(code);
    await this.assertAllowed(userId, tenantId, def);
    const repo = this.dataSource.getRepository(def.entity as any);
    const columns = this.columnsOf(def);
    const where = this.buildWhere(def, tenantId, query.filters ?? [], columns);
    const fields = columns.map((c) => c.field);
    const sortBy =
      query.sortBy ?? def.defaultSort ?? (fields.includes('createdAt') ? 'createdAt' : fields[0]);
    if (!fields.includes(sortBy)) throw new BadRequestException(`Unknown sort field '${sortBy}'`);
    const sortDir = query.sortDir === 'ASC' ? 'ASC' : 'DESC';
    return { def, repo, columns, where, fields, sortBy, sortDir };
  }

  async run(userId: string, tenantId: string, code: string, query: RunQuery) {
    const def = this.definition(code);
    await this.assertAllowed(userId, tenantId, def);
    const repo = this.dataSource.getRepository(def.entity as any);
    const columns = this.columnsOf(def);
    const where = this.buildWhere(def, tenantId, query.filters ?? [], columns);

    const fields = columns.map((c) => c.field);
    const sortBy = query.sortBy ?? def.defaultSort ?? (fields.includes('createdAt') ? 'createdAt' : fields[0]);
    if (!fields.includes(sortBy)) throw new BadRequestException(`Unknown sort field '${sortBy}'`);
    const sortDir = query.sortDir === 'ASC' ? 'ASC' : 'DESC';

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit) || 50));

    const [data, total] = await repo.findAndCount({
      select: fields as any,
      where,
      order: { [sortBy]: sortDir } as any,
      skip: (page - 1) * limit,
      take: limit,
    });
    await this.enrich(def, tenantId, data);
    return {
      data, total, page, limit, sortBy, sortDir,
      columns: [...columns, ...ReportsService.labelColumns(def)],
    };
  }

  /** Validate a filter set against a report's columns without running it. */
  validateFilters(code: string, filters: ReportFilter[]): void {
    const def = this.definition(code);
    this.buildWhere(def, '__validate__', filters ?? [], this.columnsOf(def));
  }

  // ─── Saved views ─────────────────────────────────────────────────────────

  private views(): Repository<ReportView> {
    if (!this.viewRepo) throw new BadRequestException('Saved report views are not available in this deployment');
    return this.viewRepo;
  }

  /** The caller's own views plus tenant-shared ones for a report. */
  async listViews(userId: string, tenantId: string, code: string): Promise<ReportView[]> {
    const def = this.definition(code);
    await this.assertAllowed(userId, tenantId, def);
    const rows = await this.views().find({
      where: [
        { tenantId, reportCode: code, createdByUserId: userId },
        { tenantId, reportCode: code, shared: true },
      ],
      order: { createdAt: 'DESC' },
    });
    return [...new Map(rows.map((v) => [v.id, v])).values()];
  }

  async saveView(
    userId: string,
    tenantId: string,
    dto: { reportCode: string; name: string; filters?: ReportFilter[]; sortBy?: string; sortDir?: string; shared?: boolean },
  ): Promise<ReportView> {
    const def = this.definition(dto.reportCode);
    await this.assertAllowed(userId, tenantId, def);
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    // Reject views whose filters would fail at run time.
    this.buildWhere(def, tenantId, dto.filters ?? [], this.columnsOf(def));
    const repo = this.views();
    return repo.save(repo.create({
      tenantId,
      reportCode: dto.reportCode,
      name: dto.name.trim(),
      filters: dto.filters ?? [],
      sortBy: dto.sortBy ?? null,
      sortDir: dto.sortDir === 'ASC' ? 'ASC' : 'DESC',
      shared: !!dto.shared,
      createdByUserId: userId,
    }));
  }

  async deleteView(userId: string, tenantId: string, id: string): Promise<{ deleted: boolean }> {
    const view = await this.views().findOne({ where: { id, tenantId } });
    if (!view) throw new NotFoundException('View not found');
    if (view.createdByUserId !== userId) throw new ForbiddenException('Only the creator can delete a saved view');
    await this.views().delete({ id, tenantId });
    return { deleted: true };
  }

  static toCsv(rows: any[], fields: string[]): string {
    const escape = (v: any): string => {
      if (v === null || v === undefined) return '';
      let s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
      // Neutralize spreadsheet formula injection BEFORE RFC4180 quoting. Cell
      // values are tenant-supplied (vendor/customer names, notes) and these CSVs
      // are emailed as attachments by the scheduler, so a leading =, +, -, @, tab
      // or CR would execute as a formula when opened in Excel/Sheets.
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [fields.map((f) => escape(f)).join(',')];
    for (const row of rows) lines.push(fields.map((f) => escape(row[f])).join(','));
    return lines.join('\n');
  }

  async exportCsv(userId: string, tenantId: string, code: string, query: RunQuery): Promise<{ filename: string; csv: string }> {
    // One query capped at the export limit. This previously walked run() page
    // by page (EXPORT_LIMIT / MAX_PAGE_SIZE = 20 sequential round-trips, each
    // with its own COUNT and its own enrichment pass) for a result the database
    // can return in a single statement — and it runs inside the scheduler sweep,
    // once per due schedule.
    const { def, repo, columns, where, fields: baseFields, sortBy, sortDir } =
      await this.prepare(userId, tenantId, code, query);
    const rows = await repo.find({
      select: baseFields as any,
      where,
      order: { [sortBy]: sortDir } as any,
      take: EXPORT_LIMIT,
    });
    await this.enrich(def, tenantId, rows);
    const allColumns = [...columns, ...ReportsService.labelColumns(def)];
    const fields = allColumns.map((c) => c.field);
    return { filename: `${code}-${tenantId.slice(0, 8)}.csv`, csv: ReportsService.toCsv(rows, fields) };
  }
}
