import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryOrganization } from './entities/inventory-organization.entity';
import { ItemOrgAssignment } from './entities/item-org-assignment.entity';
import { InterOrgTransfer, InterOrgStatus } from './entities/inter-org-transfer.entity';
import { Item } from './entities/item.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

@Injectable()
export class InventoryOrgService {
  constructor(
    @InjectRepository(InventoryOrganization) private readonly orgRepo: Repository<InventoryOrganization>,
    @InjectRepository(ItemOrgAssignment) private readonly assignRepo: Repository<ItemOrgAssignment>,
    @InjectRepository(InterOrgTransfer) private readonly transferRepo: Repository<InterOrgTransfer>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
  ) {}

  // ─── Ph-134: Organizations ────────────────────────────────────────

  listOrgs(tenantId: string): Promise<InventoryOrganization[]> {
    return this.orgRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async createOrg(tenantId: string, data: Partial<InventoryOrganization>): Promise<InventoryOrganization> {
    if (!data.code) throw new BadRequestException('code is required');
    const dup = await this.orgRepo.findOne({ where: { tenantId, code: data.code } });
    if (dup) throw new BadRequestException(`Organization ${data.code} already exists`);
    if (data.parentOrgId) {
      const parent = await this.orgRepo.findOne({ where: { id: data.parentOrgId, tenantId } });
      if (!parent) throw new BadRequestException('Parent organization not found');
    }
    const org = this.orgRepo.create({ tenantId, isActive: true, currency: 'USD', costMethod: 'MOVING_AVERAGE', ...data } as any) as unknown as InventoryOrganization;
    return (this.orgRepo.save(org) as unknown) as Promise<InventoryOrganization>;
  }

  async updateOrg(tenantId: string, id: string, data: Partial<InventoryOrganization>): Promise<InventoryOrganization> {
    const org = await this.orgRepo.findOne({ where: { id, tenantId } });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);
    if (data.parentOrgId === id) throw new BadRequestException('An organization cannot be its own parent');
    Object.assign(org, data);
    return (this.orgRepo.save(org) as unknown) as Promise<InventoryOrganization>;
  }

  /** Org hierarchy as nested tree of roots. */
  async orgHierarchy(tenantId: string): Promise<any[]> {
    const orgs = await this.orgRepo.find({ where: { tenantId } });
    const byParent = new Map<string | null, InventoryOrganization[]>();
    for (const o of orgs) {
      const key = o.parentOrgId ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(o);
    }
    const build = (parent: string | null): any[] =>
      (byParent.get(parent) ?? []).map((o) => ({ id: o.id, code: o.code, name: o.name, costMethod: o.costMethod, children: build(o.id) }));
    return build(null);
  }

  // ─── Ph-136: Item-org assignments ─────────────────────────────────

  listAssignments(tenantId: string, params: { itemId?: string; organizationId?: string } = {}): Promise<ItemOrgAssignment[]> {
    const where: any = { tenantId };
    if (params.itemId) where.itemId = params.itemId;
    if (params.organizationId) where.organizationId = params.organizationId;
    return this.assignRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async assignItem(tenantId: string, data: {
    itemId: string; organizationId: string; plannerId?: string; standardCost?: number; minQty?: number; maxQty?: number;
  }): Promise<ItemOrgAssignment> {
    if (!data.itemId || !data.organizationId) throw new BadRequestException('itemId and organizationId are required');
    const [item, org] = await Promise.all([
      this.itemRepo.findOne({ where: { id: data.itemId, tenantId } }),
      this.orgRepo.findOne({ where: { id: data.organizationId, tenantId } }),
    ]);
    if (!item) throw new NotFoundException('Item not found');
    if (!org) throw new NotFoundException('Organization not found');
    const existing = await this.assignRepo.findOne({ where: { tenantId, itemId: data.itemId, organizationId: data.organizationId } });
    if (existing) throw new BadRequestException('Item is already assigned to this organization');
    const a = this.assignRepo.create({
      tenantId, itemId: data.itemId, organizationId: data.organizationId, isActive: true,
      plannerId: data.plannerId ?? null,
      standardCost: data.standardCost ?? null,
      minQty: data.minQty ?? null, maxQty: data.maxQty ?? null,
    } as any) as unknown as ItemOrgAssignment;
    return (this.assignRepo.save(a) as unknown) as Promise<ItemOrgAssignment>;
  }

  async updateAssignment(tenantId: string, id: string, data: Partial<ItemOrgAssignment>): Promise<ItemOrgAssignment> {
    const a = await this.assignRepo.findOne({ where: { id, tenantId } });
    if (!a) throw new NotFoundException(`Assignment ${id} not found`);
    Object.assign(a, data);
    return (this.assignRepo.save(a) as unknown) as Promise<ItemOrgAssignment>;
  }

  async isItemActiveInOrg(tenantId: string, itemId: string, organizationId: string): Promise<boolean> {
    const a = await this.assignRepo.findOne({ where: { tenantId, itemId, organizationId, isActive: true } });
    return !!a;
  }

  // ─── Ph-135: Inter-org transfers ──────────────────────────────────

  listTransfers(tenantId: string, status?: InterOrgStatus): Promise<InterOrgTransfer[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.transferRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  private computePricing(unitCost: number, markupPct: number, qty: number, freight: number, tax: number) {
    const transferPrice = round4(unitCost * (1 + markupPct / 100));
    const totalValue = round2(transferPrice * qty + freight + tax);
    return { transferPrice, totalValue };
  }

  async createTransfer(tenantId: string, data: {
    fromOrgId: string; toOrgId: string; itemId: string; quantity: number;
    unitCost?: number; markupPct?: number; freightAmount?: number; taxAmount?: number;
    fromWarehouseId?: string; toWarehouseId?: string; notes?: string;
  }): Promise<InterOrgTransfer> {
    if (data.fromOrgId === data.toOrgId) throw new BadRequestException('Source and destination orgs must differ');
    if (!data.quantity || data.quantity <= 0) throw new BadRequestException('quantity must be > 0');
    const [fromOrg, toOrg, item] = await Promise.all([
      this.orgRepo.findOne({ where: { id: data.fromOrgId, tenantId } }),
      this.orgRepo.findOne({ where: { id: data.toOrgId, tenantId } }),
      this.itemRepo.findOne({ where: { id: data.itemId, tenantId } }),
    ]);
    if (!fromOrg || !toOrg) throw new NotFoundException('Organization not found');
    if (!item) throw new NotFoundException('Item not found');
    // item must be active in both orgs
    for (const orgId of [data.fromOrgId, data.toOrgId]) {
      if (!(await this.isItemActiveInOrg(tenantId, data.itemId, orgId))) {
        throw new BadRequestException(`Item is not active in organization ${orgId}`);
      }
    }

    const unitCost = data.unitCost ?? Number(item.standardCost) ?? 0;
    const markupPct = data.markupPct ?? 0;
    const freight = data.freightAmount ?? 0;
    const tax = data.taxAmount ?? 0;
    const { transferPrice, totalValue } = this.computePricing(unitCost, markupPct, data.quantity, freight, tax);

    const number = await this.nextTransferNumber(tenantId);
    const transfer = this.transferRepo.create({
      tenantId,
      transferNumber: number,
      fromOrgId: data.fromOrgId,
      toOrgId: data.toOrgId,
      fromWarehouseId: data.fromWarehouseId ?? null,
      toWarehouseId: data.toWarehouseId ?? null,
      itemId: data.itemId,
      quantity: round4(data.quantity),
      unitCost: round4(unitCost),
      markupPct,
      transferPrice,
      freightAmount: freight,
      taxAmount: tax,
      totalValue,
      status: InterOrgStatus.DRAFT,
      notes: data.notes ?? null,
    } as any) as unknown as InterOrgTransfer;
    return (this.transferRepo.save(transfer) as unknown) as Promise<InterOrgTransfer>;
  }

  async shipTransfer(tenantId: string, id: string): Promise<InterOrgTransfer> {
    const t = await this.getTransfer(tenantId, id);
    if (t.status !== InterOrgStatus.DRAFT) throw new BadRequestException('Only DRAFT transfers can be shipped');
    t.status = InterOrgStatus.SHIPPED;
    t.shippedAt = new Date();
    return (this.transferRepo.save(t) as unknown) as Promise<InterOrgTransfer>;
  }

  async receiveTransfer(tenantId: string, id: string): Promise<InterOrgTransfer> {
    const t = await this.getTransfer(tenantId, id);
    if (t.status !== InterOrgStatus.SHIPPED) throw new BadRequestException('Only SHIPPED transfers can be received');
    t.status = InterOrgStatus.RECEIVED;
    t.receivedAt = new Date();
    return (this.transferRepo.save(t) as unknown) as Promise<InterOrgTransfer>;
  }

  async cancelTransfer(tenantId: string, id: string): Promise<InterOrgTransfer> {
    const t = await this.getTransfer(tenantId, id);
    if (t.status === InterOrgStatus.RECEIVED) throw new BadRequestException('Received transfers cannot be cancelled');
    t.status = InterOrgStatus.CANCELLED;
    return (this.transferRepo.save(t) as unknown) as Promise<InterOrgTransfer>;
  }

  private async getTransfer(tenantId: string, id: string): Promise<InterOrgTransfer> {
    const t = await this.transferRepo.findOne({ where: { id, tenantId } });
    if (!t) throw new NotFoundException(`Transfer ${id} not found`);
    return t;
  }

  private async nextTransferNumber(tenantId: string): Promise<string> {
    const count = await this.transferRepo.count({ where: { tenantId } });
    return `IOT-${String(count + 1).padStart(6, '0')}`;
  }
}
