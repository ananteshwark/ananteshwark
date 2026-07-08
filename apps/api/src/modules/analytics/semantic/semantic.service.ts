import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DATASETS, DATASET_MAP, DatasetDef } from './dataset-registry';
import { SavedQuery } from './saved-query.entity';

export interface SemanticQuery {
  dataset: string;
  dimensions?: string[];         // dataset dimension keys; 'month' = date grain
  measures: string[];            // dataset measure keys
  filters?: Array<{ dimension: string; value: string }>;
  from?: string;                 // yyyy-mm-dd, on the dataset's date column
  to?: string;
  limit?: number;
}

export interface QueryPlan {
  sql: string;
  params: any[];
}

@Injectable()
export class SemanticService {
  constructor(
    @InjectRepository(SavedQuery)
    private readonly savedRepo: Repository<SavedQuery>,
  ) {}

  listDatasets() {
    return DATASETS.map((d) => ({
      key: d.key,
      label: d.label,
      hasDateColumn: !!d.dateColumn,
      dimensions: d.dimensions.map(({ key, label }) => ({ key, label })),
      measures: d.measures.map(({ key, label }) => ({ key, label })),
    }));
  }

  /**
   * Compile a semantic query into parameterized SQL. Every identifier comes
   * from the registry; every user value binds as a parameter. Pure function
   * of (tenantId, query) — the seam the unit tests pin down.
   */
  buildPlan(tenantId: string, query: SemanticQuery): QueryPlan {
    const dataset = DATASET_MAP.get(query.dataset);
    if (!dataset) throw new BadRequestException(`Unknown dataset "${query.dataset}"`);
    if (!query.measures?.length) throw new BadRequestException('At least one measure is required');

    const dimensionOf = (key: string) => {
      const dim = dataset.dimensions.find((d) => d.key === key);
      if (!dim) throw new BadRequestException(`Unknown dimension "${key}" for dataset "${dataset.key}"`);
      return dim;
    };

    const params: any[] = [tenantId];
    const selects: string[] = [];
    const groupBys: string[] = [];

    for (const dimKey of query.dimensions ?? []) {
      if (dimKey === 'month') {
        if (!dataset.dateColumn) {
          throw new BadRequestException(`Dataset "${dataset.key}" has no date column for a month grain`);
        }
        selects.push(`TO_CHAR(DATE_TRUNC('month', ${dataset.dateColumn}::date), 'YYYY-MM') AS "month"`);
        groupBys.push(`DATE_TRUNC('month', ${dataset.dateColumn}::date)`);
      } else {
        const dim = dimensionOf(dimKey);
        selects.push(`${dim.column} AS "${dim.key}"`);
        groupBys.push(dim.column);
      }
    }

    for (const measureKey of query.measures) {
      const measure = dataset.measures.find((m) => m.key === measureKey);
      if (!measure) throw new BadRequestException(`Unknown measure "${measureKey}" for dataset "${dataset.key}"`);
      selects.push(`${measure.sql} AS "${measure.key}"`);
    }

    const wheres = ['tenant_id = $1'];
    for (const filter of query.filters ?? []) {
      const dim = dimensionOf(filter.dimension);
      params.push(filter.value);
      wheres.push(`${dim.column} = $${params.length}`);
    }
    if (query.from) {
      if (!dataset.dateColumn) throw new BadRequestException(`Dataset "${dataset.key}" has no date column to filter`);
      params.push(query.from);
      wheres.push(`${dataset.dateColumn} >= $${params.length}`);
    }
    if (query.to) {
      if (!dataset.dateColumn) throw new BadRequestException(`Dataset "${dataset.key}" has no date column to filter`);
      params.push(query.to);
      wheres.push(`${dataset.dateColumn} <= $${params.length}`);
    }

    const limit = Math.min(Math.max(Number(query.limit) || 500, 1), 5000);
    const sql =
      `SELECT ${selects.join(', ')} FROM ${dataset.table}` +
      ` WHERE ${wheres.join(' AND ')}` +
      (groupBys.length ? ` GROUP BY ${groupBys.join(', ')}` : '') +
      (groupBys.length ? ` ORDER BY ${groupBys.join(', ')}` : '') +
      ` LIMIT ${limit}`;
    return { sql, params };
  }

  async run(tenantId: string, query: SemanticQuery): Promise<{ rows: any[]; plan: QueryPlan }> {
    const plan = this.buildPlan(tenantId, query);
    const rows = await this.savedRepo.query(plan.sql, plan.params);
    return { rows, plan };
  }

  // ─── Saved queries ────────────────────────────────────────────

  async saveQuery(
    tenantId: string, createdBy: string,
    dto: { name: string; description?: string; chartType?: string; definition: SemanticQuery },
  ): Promise<SavedQuery> {
    if (!dto.name?.trim()) throw new BadRequestException('Name is required');
    this.buildPlan(tenantId, dto.definition); // validates the definition up front
    return this.savedRepo.save(this.savedRepo.create({
      tenantId,
      name: dto.name.trim(),
      description: dto.description ?? null,
      chartType: dto.chartType ?? 'table',
      definition: dto.definition,
      createdBy,
    }));
  }

  async listSaved(tenantId: string): Promise<SavedQuery[]> {
    return this.savedRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async runSaved(tenantId: string, id: string) {
    const saved = await this.savedRepo.findOne({ where: { id, tenantId } });
    if (!saved) throw new NotFoundException(`Saved query ${id} not found`);
    const result = await this.run(tenantId, saved.definition as SemanticQuery);
    return { query: saved, ...result };
  }

  async deleteSaved(tenantId: string, id: string): Promise<void> {
    const result = await this.savedRepo.delete({ id, tenantId });
    if (!result.affected) throw new NotFoundException(`Saved query ${id} not found`);
  }
}
