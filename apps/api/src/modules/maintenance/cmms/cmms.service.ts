import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrderPart, WoPartStatus } from './entities/work-order-part.entity';
import { AssetWarranty, WarrantyStatus } from './entities/asset-warranty.entity';
import { MaintenanceOrder } from '../entities/maintenance-order.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class CmmsService {
  constructor(
    @InjectRepository(WorkOrderPart) private readonly partRepo: Repository<WorkOrderPart>,
    @InjectRepository(AssetWarranty) private readonly warrantyRepo: Repository<AssetWarranty>,
    @InjectRepository(MaintenanceOrder) private readonly orderRepo: Repository<MaintenanceOrder>,
  ) {}

  // ─── Ph-164: WO parts reservation ─────────────────────────────────

  listParts(tenantId: string, maintenanceOrderId: string): Promise<WorkOrderPart[]> {
    return this.partRepo.find({ where: { tenantId, maintenanceOrderId }, order: { createdAt: 'ASC' } });
  }

  async reservePart(tenantId: string, data: {
    maintenanceOrderId: string; itemId: string; itemName?: string; qtyReserved: number; unitCost?: number;
  }): Promise<WorkOrderPart> {
    const order = await this.orderRepo.findOne({ where: { id: data.maintenanceOrderId, tenantId } });
    if (!order) throw new NotFoundException(`Work order ${data.maintenanceOrderId} not found`);
    if (!data.qtyReserved || data.qtyReserved <= 0) throw new BadRequestException('qtyReserved must be > 0');
    const part = this.partRepo.create({
      tenantId, maintenanceOrderId: data.maintenanceOrderId, itemId: data.itemId, itemName: data.itemName ?? null,
      qtyReserved: data.qtyReserved, qtyIssued: 0, unitCost: data.unitCost ?? 0, status: WoPartStatus.RESERVED,
    } as any) as unknown as WorkOrderPart;
    return (this.partRepo.save(part) as unknown) as Promise<WorkOrderPart>;
  }

  async issuePart(tenantId: string, id: string, qtyIssued?: number): Promise<WorkOrderPart> {
    const part = await this.partRepo.findOne({ where: { id, tenantId } });
    if (!part) throw new NotFoundException(`Part ${id} not found`);
    if (part.status !== WoPartStatus.RESERVED) throw new BadRequestException('Only RESERVED parts can be issued');
    part.qtyIssued = qtyIssued != null ? qtyIssued : Number(part.qtyReserved);
    part.status = WoPartStatus.ISSUED;
    return (this.partRepo.save(part) as unknown) as Promise<WorkOrderPart>;
  }

  async cancelPart(tenantId: string, id: string): Promise<WorkOrderPart> {
    const part = await this.partRepo.findOne({ where: { id, tenantId } });
    if (!part) throw new NotFoundException(`Part ${id} not found`);
    if (part.status === WoPartStatus.ISSUED) throw new BadRequestException('Issued parts cannot be cancelled');
    part.status = WoPartStatus.CANCELLED;
    return (this.partRepo.save(part) as unknown) as Promise<WorkOrderPart>;
  }

  /** Issue all reserved parts for a WO (call on completion). */
  async issueAllForOrder(tenantId: string, maintenanceOrderId: string): Promise<{ issued: number; partsCost: number }> {
    const parts = await this.partRepo.find({ where: { tenantId, maintenanceOrderId, status: WoPartStatus.RESERVED } });
    let cost = 0;
    for (const p of parts) {
      p.qtyIssued = Number(p.qtyReserved);
      p.status = WoPartStatus.ISSUED;
      cost = round2(cost + Number(p.qtyIssued) * Number(p.unitCost));
      await this.partRepo.save(p);
    }
    return { issued: parts.length, partsCost: cost };
  }

  // ─── Ph-166: Warranty ─────────────────────────────────────────────

  listWarranties(tenantId: string, equipmentId?: string): Promise<AssetWarranty[]> {
    const where: any = { tenantId };
    if (equipmentId) where.equipmentId = equipmentId;
    return this.warrantyRepo.find({ where, order: { startDate: 'DESC' } });
  }

  async createWarranty(tenantId: string, data: {
    equipmentId: string; provider: string; startDate: string; endDate: string; policyNumber?: string; terms?: string;
  }): Promise<AssetWarranty> {
    if (!data.equipmentId || !data.provider) throw new BadRequestException('equipmentId and provider are required');
    if (data.endDate < data.startDate) throw new BadRequestException('endDate must be on/after startDate');
    const w = this.warrantyRepo.create({
      tenantId, equipmentId: data.equipmentId, provider: data.provider, startDate: data.startDate, endDate: data.endDate,
      policyNumber: data.policyNumber ?? null, terms: data.terms ?? null, claimCount: 0, claimedAmount: 0, status: WarrantyStatus.ACTIVE,
    } as any) as unknown as AssetWarranty;
    return (this.warrantyRepo.save(w) as unknown) as Promise<AssetWarranty>;
  }

  /** Active warranty covering a given date for the equipment, if any. */
  async activeWarranty(tenantId: string, equipmentId: string, onDate: string): Promise<AssetWarranty | null> {
    const warranties = await this.warrantyRepo.find({ where: { tenantId, equipmentId, status: WarrantyStatus.ACTIVE } });
    return warranties.find((w) => w.startDate <= onDate && w.endDate >= onDate) ?? null;
  }

  async isUnderWarranty(tenantId: string, equipmentId: string, onDate: string): Promise<{ underWarranty: boolean; warranty: AssetWarranty | null }> {
    const w = await this.activeWarranty(tenantId, equipmentId, onDate);
    return { underWarranty: !!w, warranty: w };
  }

  async recordClaim(tenantId: string, warrantyId: string, amount: number): Promise<AssetWarranty> {
    const w = await this.warrantyRepo.findOne({ where: { id: warrantyId, tenantId } });
    if (!w) throw new NotFoundException(`Warranty ${warrantyId} not found`);
    if (w.status !== WarrantyStatus.ACTIVE) throw new BadRequestException('Only active warranties can be claimed');
    if (!amount || amount <= 0) throw new BadRequestException('amount must be > 0');
    w.claimCount += 1;
    w.claimedAmount = round2(Number(w.claimedAmount) + amount);
    return (this.warrantyRepo.save(w) as unknown) as Promise<AssetWarranty>;
  }

  // ─── Ph-165: Asset service history ────────────────────────────────

  /** Full service history for an asset: work orders + parts + labor + cost rollup. */
  async serviceHistory(tenantId: string, equipmentId: string): Promise<any> {
    const orders = await this.orderRepo.find({ where: { tenantId, equipmentId }, order: { createdAt: 'DESC' } });
    const orderIds = orders.map((o) => o.id);
    const allParts = orderIds.length
      ? await this.partRepo.find({ where: { tenantId } })
      : [];
    const partsByOrder = new Map<string, WorkOrderPart[]>();
    for (const p of allParts) {
      if (!orderIds.includes(p.maintenanceOrderId)) continue;
      if (!partsByOrder.has(p.maintenanceOrderId)) partsByOrder.set(p.maintenanceOrderId, []);
      partsByOrder.get(p.maintenanceOrderId)!.push(p);
    }

    let totalLaborHours = 0;
    let totalPartsCost = 0;
    let totalCost = 0;
    const history = orders.map((o) => {
      const parts = partsByOrder.get(o.id) ?? [];
      const partsCost = round2(parts.reduce((s, p) => s + Number(p.qtyIssued) * Number(p.unitCost), 0));
      totalLaborHours += Number(o.laborHours ?? 0);
      totalPartsCost = round2(totalPartsCost + partsCost);
      totalCost = round2(totalCost + Number(o.totalCost ?? 0) + partsCost);
      return {
        orderNumber: o.orderNumber, type: o.type, status: o.status,
        actualStartDate: o.actualStartDate, actualEndDate: o.actualEndDate,
        laborHours: Number(o.laborHours ?? 0), partsCount: parts.length, partsCost, orderCost: Number(o.totalCost ?? 0),
      };
    });

    return {
      equipmentId,
      workOrderCount: orders.length,
      totalLaborHours: round2(totalLaborHours),
      totalPartsCost,
      totalCost,
      history,
    };
  }
}
