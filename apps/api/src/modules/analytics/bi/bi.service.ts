import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubjectArea } from './entities/subject-area.entity';
import { SavedReport, ReportVisibility, ReportMeasure, ReportFilter, ReportSort } from './entities/saved-report.entity';
import { ReportSchedule } from './entities/report-schedule.entity';
import { KpiTile } from './entities/kpi-tile.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function matchFilter(row: any, f: ReportFilter): boolean {
  const v = row[f.field];
  switch (f.op) {
    case 'eq': return v === f.value;
    case 'ne': return v !== f.value;
    case 'gt': return Number(v) > Number(f.value);
    case 'gte': return Number(v) >= Number(f.value);
    case 'lt': return Number(v) < Number(f.value);
    case 'lte': return Number(v) <= Number(f.value);
    case 'contains': return String(v ?? '').toLowerCase().includes(String(f.value).toLowerCase());
    case 'in': return Array.isArray(f.value) && f.value.includes(v);
    default: return false;
  }
}

function aggregate(values: number[], agg: string): number {
  if (agg === 'COUNT') return values.length;
  if (values.length === 0) return 0;
  switch (agg) {
    case 'SUM': return round2(values.reduce((s, x) => s + x, 0));
    case 'AVG': return round2(values.reduce((s, x) => s + x, 0) / values.length);
    case 'MIN': return Math.min(...values);
    case 'MAX': return Math.max(...values);
    default: return round2(values.reduce((s, x) => s + x, 0));
  }
}

@Injectable()
export class BiService {
  constructor(
    @InjectRepository(SubjectArea) private readonly saRepo: Repository<SubjectArea>,
    @InjectRepository(SavedReport) private readonly reportRepo: Repository<SavedReport>,
    @InjectRepository(ReportSchedule) private readonly scheduleRepo: Repository<ReportSchedule>,
    @InjectRepository(KpiTile) private readonly tileRepo: Repository<KpiTile>,
  ) {}

  // ─── Ph-251: subject areas ────────────────────────────────────────

  listSubjectAreas(tenantId: string): Promise<SubjectArea[]> {
    return this.saRepo.find({ where: { tenantId }, order: { pillar: 'ASC' } });
  }

  async createSubjectArea(tenantId: string, data: Partial<SubjectArea>): Promise<SubjectArea> {
    if (!data.code?.trim() || !data.name?.trim() || !data.pillar?.trim()) throw new BadRequestException('code, name, and pillar are required');
    const dup = await this.saRepo.findOne({ where: { tenantId, code: data.code } });
    if (dup) throw new BadRequestException('Subject area code already exists');
    const sa = this.saRepo.create({
      tenantId, code: data.code, name: data.name, pillar: data.pillar,
      dimensions: data.dimensions ?? [], measures: data.measures ?? [],
    } as any) as unknown as SubjectArea;
    return (this.saRepo.save(sa) as unknown) as Promise<SubjectArea>;
  }

  async seedDefaults(tenantId: string): Promise<SubjectArea[]> {
    const existing = await this.saRepo.count({ where: { tenantId } });
    if (existing > 0) throw new BadRequestException('Subject areas already exist');
    const defs: Partial<SubjectArea>[] = [
      { code: 'FIN_GL', name: 'General Ledger', pillar: 'FINANCE', dimensions: [{ key: 'account', label: 'Account', type: 'string' }, { key: 'costCenter', label: 'Cost Center', type: 'string' }, { key: 'period', label: 'Period', type: 'string' }], measures: [{ key: 'amount', label: 'Amount', defaultAgg: 'SUM' }] },
      { code: 'HCM_HEAD', name: 'Headcount', pillar: 'HCM', dimensions: [{ key: 'department', label: 'Department', type: 'string' }, { key: 'grade', label: 'Grade', type: 'string' }], measures: [{ key: 'headcount', label: 'Headcount', defaultAgg: 'COUNT' }, { key: 'salary', label: 'Salary', defaultAgg: 'SUM' }] },
      { code: 'SCM_INV', name: 'Inventory', pillar: 'SCM', dimensions: [{ key: 'warehouse', label: 'Warehouse', type: 'string' }, { key: 'item', label: 'Item', type: 'string' }], measures: [{ key: 'qty', label: 'Quantity', defaultAgg: 'SUM' }, { key: 'value', label: 'Value', defaultAgg: 'SUM' }] },
      { code: 'CRM_PIPE', name: 'Pipeline', pillar: 'CRM', dimensions: [{ key: 'stage', label: 'Stage', type: 'string' }, { key: 'owner', label: 'Owner', type: 'string' }], measures: [{ key: 'value', label: 'Value', defaultAgg: 'SUM' }, { key: 'count', label: 'Count', defaultAgg: 'COUNT' }] },
    ];
    const saved: SubjectArea[] = [];
    for (const d of defs) saved.push(await this.createSubjectArea(tenantId, d));
    return saved;
  }

  // ─── Ph-252: report builder ───────────────────────────────────────

  async createReport(tenantId: string, ownerId: string, data: { name: string; subjectAreaCode: string; dimensions?: string[]; measures?: ReportMeasure[]; filters?: ReportFilter[]; sort?: ReportSort[]; visibility?: ReportVisibility }): Promise<SavedReport> {
    if (!data.name?.trim()) throw new BadRequestException('name is required');
    const sa = await this.saRepo.findOne({ where: { tenantId, code: data.subjectAreaCode } });
    if (!sa) throw new NotFoundException(`Subject area ${data.subjectAreaCode} not found`);
    const dimKeys = new Set(sa.dimensions.map((d) => d.key));
    const measureKeys = new Set(sa.measures.map((m) => m.key));
    for (const d of data.dimensions ?? []) if (!dimKeys.has(d)) throw new BadRequestException(`Unknown dimension "${d}"`);
    for (const m of data.measures ?? []) if (!measureKeys.has(m.key)) throw new BadRequestException(`Unknown measure "${m.key}"`);
    const r = this.reportRepo.create({
      tenantId, name: data.name, subjectAreaCode: data.subjectAreaCode, dimensions: data.dimensions ?? [],
      measures: data.measures ?? [], filters: data.filters ?? [], sort: data.sort ?? [],
      visibility: data.visibility ?? ReportVisibility.PERSONAL, ownerId,
    } as any) as unknown as SavedReport;
    return (this.reportRepo.save(r) as unknown) as Promise<SavedReport>;
  }

  /** Reports visible to a user: their own plus any shared. */
  async listReports(tenantId: string, userId: string): Promise<SavedReport[]> {
    const all = await this.reportRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
    return all.filter((r) => r.ownerId === userId || r.visibility === ReportVisibility.SHARED);
  }

  getReport(tenantId: string, id: string): Promise<SavedReport | null> {
    return this.reportRepo.findOne({ where: { id, tenantId } });
  }

  /**
   * Execute a report definition against an in-memory dataset: filter → group by
   * dimensions → aggregate measures → sort.
   */
  executeDefinition(def: { dimensions?: string[]; measures?: ReportMeasure[]; filters?: ReportFilter[]; sort?: ReportSort[] }, rows: any[]): any {
    let data = Array.isArray(rows) ? [...rows] : [];
    for (const f of def.filters ?? []) data = data.filter((r) => matchFilter(r, f));

    const dims = def.dimensions ?? [];
    const measures = def.measures ?? [];
    let result: any[];
    if (dims.length === 0 && measures.length === 0) {
      result = data;
    } else if (dims.length === 0) {
      const out: any = {};
      for (const m of measures) out[m.key] = aggregate(data.map((r) => Number(r[m.key]) || 0), m.agg);
      result = [out];
    } else {
      const groups = new Map<string, any[]>();
      for (const r of data) {
        const key = dims.map((d) => r[d]).join('');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
      }
      result = [...groups.values()].map((grp) => {
        const out: any = {};
        for (const d of dims) out[d] = grp[0][d];
        for (const m of measures) out[m.key] = aggregate(grp.map((r) => Number(r[m.key]) || 0), m.agg);
        return out;
      });
    }
    for (const s of [...(def.sort ?? [])].reverse()) {
      result.sort((a, b) => {
        const av = a[s.key], bv = b[s.key];
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''));
        return s.dir === 'DESC' ? -cmp : cmp;
      });
    }
    return { rowCount: result.length, rows: result };
  }

  async runReport(tenantId: string, id: string, rows: any[]): Promise<any> {
    const report = await this.reportRepo.findOne({ where: { id, tenantId } });
    if (!report) throw new NotFoundException('Report not found');
    return { report: report.name, ...this.executeDefinition(report, rows) };
  }

  // ─── Ph-253: scheduled reports ────────────────────────────────────

  async createSchedule(tenantId: string, data: { reportId: string; cron: string; recipients: string[]; format?: string }): Promise<ReportSchedule> {
    const report = await this.reportRepo.findOne({ where: { id: data.reportId, tenantId } });
    if (!report) throw new NotFoundException('Report not found');
    if (!/^(\S+\s+){4}\S+$/.test(data.cron ?? '')) throw new BadRequestException('cron must be a 5-field expression');
    if (!data.recipients?.length) throw new BadRequestException('at least one recipient is required');
    const s = this.scheduleRepo.create({
      tenantId, reportId: data.reportId, cron: data.cron, recipients: data.recipients,
      format: data.format ?? 'CSV', isActive: true, lastRunAt: null,
    } as any) as unknown as ReportSchedule;
    return (this.scheduleRepo.save(s) as unknown) as Promise<ReportSchedule>;
  }

  listSchedules(tenantId: string): Promise<ReportSchedule[]> {
    return this.scheduleRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async markScheduleRun(tenantId: string, id: string, at: string): Promise<ReportSchedule> {
    const s = await this.scheduleRepo.findOne({ where: { id, tenantId } });
    if (!s) throw new NotFoundException('Schedule not found');
    s.lastRunAt = new Date(at);
    return (this.scheduleRepo.save(s) as unknown) as Promise<ReportSchedule>;
  }

  // ─── Ph-254: KPI tiles ────────────────────────────────────────────

  async createTile(tenantId: string, data: Partial<KpiTile>): Promise<KpiTile> {
    if (!data.title?.trim() || !data.measure?.trim()) throw new BadRequestException('title and measure are required');
    const t = this.tileRepo.create({
      tenantId, dashboardId: data.dashboardId ?? 'home', title: data.title, subjectAreaCode: data.subjectAreaCode ?? '',
      measure: data.measure, agg: data.agg ?? 'SUM', filters: data.filters ?? [], target: data.target ?? null,
      drillReportId: data.drillReportId ?? null, position: data.position ?? 0,
    } as any) as unknown as KpiTile;
    return (this.tileRepo.save(t) as unknown) as Promise<KpiTile>;
  }

  listTiles(tenantId: string, dashboardId = 'home'): Promise<KpiTile[]> {
    return this.tileRepo.find({ where: { tenantId, dashboardId }, order: { position: 'ASC' } });
  }

  /** Compute a tile's value over a dataset and compare to its target. */
  async computeTile(tenantId: string, id: string, rows: any[]): Promise<any> {
    const tile = await this.tileRepo.findOne({ where: { id, tenantId } });
    if (!tile) throw new NotFoundException('Tile not found');
    let data = Array.isArray(rows) ? [...rows] : [];
    for (const f of tile.filters ?? []) data = data.filter((r) => matchFilter(r, f));
    const value = aggregate(data.map((r) => Number(r[tile.measure]) || 0), tile.agg);
    const target = tile.target != null ? Number(tile.target) : null;
    const attainmentPct = target && target !== 0 ? round2((value / target) * 100) : null;
    const status = target == null ? 'NONE' : value >= target ? 'ON_TARGET' : 'BELOW';
    return { tileId: tile.id, title: tile.title, value, target, attainmentPct, status, drillReportId: tile.drillReportId };
  }
}
