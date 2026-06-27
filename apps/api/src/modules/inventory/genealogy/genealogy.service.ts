import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { LotGenealogy, GenealogyRelation } from './entities/lot-genealogy.entity';
import { LotSerial } from '../entities/lot-serial.entity';

@Injectable()
export class GenealogyService {
  constructor(
    @InjectRepository(LotGenealogy) private readonly genRepo: Repository<LotGenealogy>,
    @InjectRepository(LotSerial) private readonly lotRepo: Repository<LotSerial>,
  ) {}

  // ─── Ph-141: Capture ──────────────────────────────────────────────

  async recordEdge(tenantId: string, data: {
    parentLotId: string; childLotId: string; relation?: GenealogyRelation;
    quantityUsed?: number; sourceType?: string; sourceId?: string; eventDate: string;
  }): Promise<LotGenealogy> {
    if (!data.parentLotId || !data.childLotId) throw new BadRequestException('parentLotId and childLotId are required');
    if (data.parentLotId === data.childLotId) throw new BadRequestException('A lot cannot be its own parent');
    const edge = this.genRepo.create({
      tenantId,
      parentLotId: data.parentLotId,
      childLotId: data.childLotId,
      relation: data.relation ?? GenealogyRelation.CONSUMED,
      quantityUsed: data.quantityUsed ?? 0,
      sourceType: data.sourceType ?? null,
      sourceId: data.sourceId ?? null,
      eventDate: data.eventDate,
    } as any) as unknown as LotGenealogy;
    return (this.genRepo.save(edge) as unknown) as Promise<LotGenealogy>;
  }

  /**
   * Record a production completion: the produced (parent) lot consumed a set of
   * component (child) lots.
   */
  async recordProduction(tenantId: string, data: {
    parentLotId: string; components: Array<{ childLotId: string; quantityUsed: number }>;
    sourceId?: string; eventDate: string;
  }): Promise<LotGenealogy[]> {
    if (!data.components?.length) throw new BadRequestException('At least one component lot is required');
    const edges: LotGenealogy[] = [];
    for (const c of data.components) {
      edges.push(await this.recordEdge(tenantId, {
        parentLotId: data.parentLotId, childLotId: c.childLotId, relation: GenealogyRelation.CONSUMED,
        quantityUsed: c.quantityUsed, sourceType: 'PRODUCTION_ORDER', sourceId: data.sourceId, eventDate: data.eventDate,
      }));
    }
    return edges;
  }

  // ─── lot enrichment ───────────────────────────────────────────────

  private async lotMap(tenantId: string, ids: string[]): Promise<Map<string, LotSerial>> {
    if (ids.length === 0) return new Map();
    const lots = await this.lotRepo.find({ where: { tenantId, id: In([...new Set(ids)]) } });
    return new Map(lots.map((l) => [l.id, l]));
  }

  private lotNode(id: string, lots: Map<string, LotSerial>, extra: any = {}) {
    const lot = lots.get(id);
    return {
      lotId: id,
      lotNumber: lot?.lotNumber ?? null,
      itemId: lot?.itemId ?? null,
      status: lot?.status ?? null,
      expiryDate: lot?.expiryDate ?? null,
      ...extra,
    };
  }

  // ─── Ph-143: Backward trace (parent → components) ─────────────────

  /** Given an FG lot, return the tree of component lots consumed to make it. */
  async backwardTrace(tenantId: string, lotId: string, maxDepth = 20): Promise<any> {
    const lot = await this.lotRepo.findOne({ where: { id: lotId, tenantId } });
    if (!lot) throw new NotFoundException(`Lot ${lotId} not found`);
    const visited = new Set<string>();

    const build = async (id: string, depth: number): Promise<any[]> => {
      if (depth > maxDepth || visited.has(id)) return [];
      visited.add(id);
      const edges = await this.genRepo.find({ where: { tenantId, parentLotId: id } });
      if (edges.length === 0) return [];
      const lots = await this.lotMap(tenantId, edges.map((e) => e.childLotId));
      const children: any[] = [];
      for (const e of edges) {
        children.push(this.lotNode(e.childLotId, lots, {
          relation: e.relation, quantityUsed: Number(e.quantityUsed), eventDate: e.eventDate,
          children: await build(e.childLotId, depth + 1),
        }));
      }
      return children;
    };

    const rootLots = new Map([[lotId, lot]]);
    return { ...this.lotNode(lotId, rootLots), children: await build(lotId, 0) };
  }

  // ─── Ph-142: Forward trace (child → finished goods) ───────────────

  /** Given a raw-material lot, return the tree of FG lots that consumed it. */
  async forwardTrace(tenantId: string, lotId: string, maxDepth = 20): Promise<any> {
    const lot = await this.lotRepo.findOne({ where: { id: lotId, tenantId } });
    if (!lot) throw new NotFoundException(`Lot ${lotId} not found`);
    const visited = new Set<string>();

    const build = async (id: string, depth: number): Promise<any[]> => {
      if (depth > maxDepth || visited.has(id)) return [];
      visited.add(id);
      const edges = await this.genRepo.find({ where: { tenantId, childLotId: id } });
      if (edges.length === 0) return [];
      const lots = await this.lotMap(tenantId, edges.map((e) => e.parentLotId));
      const parents: any[] = [];
      for (const e of edges) {
        parents.push(this.lotNode(e.parentLotId, lots, {
          relation: e.relation, quantityUsed: Number(e.quantityUsed), eventDate: e.eventDate,
          parents: await build(e.parentLotId, depth + 1),
        }));
      }
      return parents;
    };

    const rootLots = new Map([[lotId, lot]]);
    return { ...this.lotNode(lotId, rootLots), parents: await build(lotId, 0) };
  }

  // ─── Ph-144: Recall impact ────────────────────────────────────────

  /**
   * Forward-trace a recalled lot to every downstream lot, then surface the
   * top-level (finished-good) lots — those that are not themselves consumed
   * further — as the recall impact set.
   */
  async recallImpact(tenantId: string, lotId: string, maxDepth = 30): Promise<any> {
    const lot = await this.lotRepo.findOne({ where: { id: lotId, tenantId } });
    if (!lot) throw new NotFoundException(`Lot ${lotId} not found`);

    const allDownstream = new Set<string>();
    const queue: string[] = [lotId];
    let depth = 0;
    while (queue.length && depth <= maxDepth) {
      const layer = [...queue];
      queue.length = 0;
      const edges = await this.genRepo.find({ where: { tenantId, childLotId: In(layer) } });
      for (const e of edges) {
        if (!allDownstream.has(e.parentLotId)) {
          allDownstream.add(e.parentLotId);
          queue.push(e.parentLotId);
        }
      }
      depth++;
    }

    // top-level lots = downstream lots that are never a child of another edge
    const downstreamIds = [...allDownstream];
    const asChild = downstreamIds.length
      ? await this.genRepo.find({ where: { tenantId, childLotId: In(downstreamIds) } })
      : [];
    const hasParent = new Set(asChild.map((e) => e.childLotId));
    const topLevelIds = downstreamIds.filter((id) => !hasParent.has(id));

    const lots = await this.lotMap(tenantId, [...downstreamIds, lotId]);
    return {
      recalledLot: this.lotNode(lotId, lots),
      affectedLotCount: downstreamIds.length,
      affectedLots: downstreamIds.map((id) => this.lotNode(id, lots)),
      finishedGoodLots: topLevelIds.map((id) => this.lotNode(id, lots)),
    };
  }

  async listEdges(tenantId: string, params: { parentLotId?: string; childLotId?: string } = {}): Promise<LotGenealogy[]> {
    const where: any = { tenantId };
    if (params.parentLotId) where.parentLotId = params.parentLotId;
    if (params.childLotId) where.childLotId = params.childLotId;
    return this.genRepo.find({ where, order: { createdAt: 'DESC' } });
  }
}
