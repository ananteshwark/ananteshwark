import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { IntegrationScript, ScheduledJob, DeliveryType, ApiDefinition, ApiSourceType } from './entities/integration.entity';
import { DeliveryAdapter } from './delivery.adapter';
import { StudioService } from '../studio.service';

type Row = Record<string, any>;

// Whitelisted comparison operators for filter steps.
function cmp(actual: any, op: string, expected: any): boolean {
  switch (op) {
    case 'eq': return actual === expected;
    case 'ne': return actual !== expected;
    case 'gt': return Number(actual) > Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    case 'in': return Array.isArray(expected) && expected.includes(actual);
    case 'contains': return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    default: return true;
  }
}

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectRepository(IntegrationScript) private readonly scriptRepo: Repository<IntegrationScript>,
    @InjectRepository(ScheduledJob) private readonly jobRepo: Repository<ScheduledJob>,
    @InjectRepository(ApiDefinition) private readonly apiRepo: Repository<ApiDefinition>,
    private readonly delivery: DeliveryAdapter,
    @Optional() private readonly studio?: StudioService,
  ) {}

  // ─── Safe declarative script runtime ──────────────────────────

  /**
   * Execute a whitelisted transform pipeline over input rows. Supported ops:
   * filter, select, map (arithmetic over fields + constants), aggregate
   * (group/sum/avg/count/min/max), sort, limit. No arbitrary code — every step
   * is a data-shape operation, so it is inherently sandboxed.
   */
  static runPipeline(steps: Array<Record<string, any>>, rows: Row[]): Row[] {
    let data: Row[] = [...(rows ?? [])];
    for (const step of steps ?? []) {
      switch (step.op) {
        case 'filter':
          data = data.filter((r) => cmp(r[step.field], step.cmp ?? 'eq', step.value));
          break;
        case 'select':
          data = data.map((r) => Object.fromEntries((step.fields ?? []).map((f: string) => [f, r[f]])));
          break;
        case 'map': {
          data = data.map((r) => ({ ...r, [step.outputField]: IntegrationsService.evalExpr(step.expr, r) }));
          break;
        }
        case 'aggregate':
          data = IntegrationsService.aggregate(data, step.groupBy, step.measure, (step.agg ?? 'sum').toLowerCase());
          break;
        case 'sort': {
          const dir = step.dir === 'desc' ? -1 : 1;
          data = [...data].sort((a, b) => (a[step.field] > b[step.field] ? dir : a[step.field] < b[step.field] ? -dir : 0));
          break;
        }
        case 'limit':
          data = data.slice(0, Math.max(0, Number(step.n) || 0));
          break;
        default:
          throw new BadRequestException(`Unsupported pipeline op "${step.op}"`);
      }
    }
    return data;
  }

  /**
   * A tiny, safe arithmetic evaluator: `expr` is `{ op:'+'|'-'|'*'|'/', a, b }`
   * where a/b are `{ field }`, `{ const }`, or nested expr. No string eval.
   */
  static evalExpr(expr: any, row: Row): any {
    if (expr == null) return null;
    if (typeof expr !== 'object') return expr;
    if ('field' in expr) return Number(row[expr.field]) || 0;
    if ('const' in expr) return expr.const;
    const a = IntegrationsService.evalExpr(expr.a, row);
    const b = IntegrationsService.evalExpr(expr.b, row);
    switch (expr.op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? 0 : a / b;
      default: throw new BadRequestException(`Unsupported expr op "${expr.op}"`);
    }
  }

  private static aggregate(rows: Row[], groupBy: string | undefined, measure: string, agg: string): Row[] {
    const groups = new Map<string, number[]>();
    for (const r of rows) {
      const key = groupBy ? String(r[groupBy] ?? '—') : '__all__';
      const v = Number(r[measure]);
      const arr = groups.get(key) ?? [];
      if (Number.isFinite(v)) arr.push(v);
      groups.set(key, arr);
    }
    const reduce = (xs: number[]) => {
      if (!xs.length) return 0;
      switch (agg) {
        case 'count': return xs.length;
        case 'avg': return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;
        case 'min': return Math.min(...xs);
        case 'max': return Math.max(...xs);
        default: return Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
      }
    };
    return [...groups.entries()].map(([key, xs]) => (groupBy ? { [groupBy]: key, [`${agg}_${measure}`]: reduce(xs) } : { [`${agg}_${measure}`]: reduce(xs) }));
  }

  async createScript(tenantId: string, dto: { key: string; name: string; description?: string; steps?: any[] }): Promise<IntegrationScript> {
    if (!dto.key?.trim() || !dto.name?.trim()) throw new BadRequestException('key and name are required');
    const existing = await this.scriptRepo.findOne({ where: { tenantId, key: dto.key.trim() } });
    if (existing) throw new BadRequestException(`Script key "${dto.key}" already exists`);
    // Validate the pipeline by dry-running it over an empty set (surfaces bad ops early).
    IntegrationsService.runPipeline(dto.steps ?? [], []);
    return this.scriptRepo.save(this.scriptRepo.create({ tenantId, key: dto.key.trim(), name: dto.name.trim(), description: dto.description ?? null, steps: dto.steps ?? [], active: true }));
  }

  listScripts(tenantId: string): Promise<IntegrationScript[]> {
    return this.scriptRepo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  async runScript(tenantId: string, key: string, rows: Row[]): Promise<Row[]> {
    const script = await this.scriptRepo.findOne({ where: { tenantId, key } });
    if (!script) throw new NotFoundException(`Script "${key}" not found`);
    return IntegrationsService.runPipeline(script.steps, rows);
  }

  // ─── Scheduling ───────────────────────────────────────────────

  async createJob(tenantId: string, dto: { name: string; scriptKey: string; intervalMinutes?: number; deliveryType?: DeliveryType; deliveryConfig?: Record<string, any>; startAt?: string }): Promise<ScheduledJob> {
    if (!dto.name?.trim() || !dto.scriptKey) throw new BadRequestException('name and scriptKey are required');
    const script = await this.scriptRepo.findOne({ where: { tenantId, key: dto.scriptKey } });
    if (!script) throw new NotFoundException(`Script "${dto.scriptKey}" not found`);
    const interval = dto.intervalMinutes ?? 1440;
    if (!(interval > 0)) throw new BadRequestException('intervalMinutes must be positive');
    return this.jobRepo.save(this.jobRepo.create({
      tenantId, name: dto.name.trim(), scriptKey: dto.scriptKey, intervalMinutes: interval,
      deliveryType: dto.deliveryType ?? DeliveryType.NONE, deliveryConfig: dto.deliveryConfig ?? {},
      active: true, nextRunAt: dto.startAt ? new Date(dto.startAt) : null,
    }));
  }

  listJobs(tenantId: string): Promise<ScheduledJob[]> {
    return this.jobRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  /** Jobs whose nextRunAt is due as of the given instant. */
  dueJobs(tenantId: string, asOf: Date): Promise<ScheduledJob[]> {
    return this.jobRepo.find({ where: { tenantId, active: true, nextRunAt: LessThanOrEqual(asOf) }, order: { nextRunAt: 'ASC' } });
  }

  /** Record a run and roll nextRunAt forward by the interval; deliver output. */
  async runJob(tenantId: string, jobId: string, rows: Row[], now: Date): Promise<{ job: ScheduledJob; output: Row[]; delivery: any }> {
    const job = await this.jobRepo.findOne({ where: { id: jobId, tenantId } });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    const output = await this.runScript(tenantId, job.scriptKey, rows);
    const delivery = await this.delivery.deliver(job.deliveryType, job.deliveryConfig, output);
    job.lastRunAt = now;
    job.nextRunAt = new Date(now.getTime() + job.intervalMinutes * 60000);
    const saved = await this.jobRepo.save(job);
    return { job: saved, output, delivery };
  }

  // ─── API builder ──────────────────────────────────────────────

  async createApiDefinition(tenantId: string, dto: { path: string; name: string; sourceType: ApiSourceType; sourceRef: string; scopeRequired?: string }): Promise<ApiDefinition> {
    if (!dto.path?.trim() || !dto.sourceRef?.trim()) throw new BadRequestException('path and sourceRef are required');
    if (!Object.values(ApiSourceType).includes(dto.sourceType)) throw new BadRequestException('A valid sourceType is required');
    const existing = await this.apiRepo.findOne({ where: { tenantId, path: dto.path.trim() } });
    if (existing) throw new BadRequestException(`API path "${dto.path}" already exists`);
    return this.apiRepo.save(this.apiRepo.create({
      tenantId, path: dto.path.trim(), name: dto.name?.trim() || dto.path.trim(),
      sourceType: dto.sourceType, sourceRef: dto.sourceRef.trim(), scopeRequired: dto.scopeRequired ?? null, active: true,
    }));
  }

  listApiDefinitions(tenantId: string): Promise<ApiDefinition[]> {
    return this.apiRepo.find({ where: { tenantId }, order: { path: 'ASC' } });
  }

  /** Resolve a defined API to its data (lookup-table rows, or a script over provided rows). */
  async resolveApi(tenantId: string, path: string, inputRows: Row[] = []): Promise<Row[]> {
    const def = await this.apiRepo.findOne({ where: { tenantId, path, active: true } });
    if (!def) throw new NotFoundException(`API "${path}" not found`);
    if (def.sourceType === ApiSourceType.LOOKUP_TABLE) {
      if (!this.studio) throw new BadRequestException('Lookup source is unavailable');
      const rows = await this.studio.listRows(tenantId, def.sourceRef);
      return rows.map((r) => r.values);
    }
    return this.runScript(tenantId, def.sourceRef, inputRows);
  }
}
