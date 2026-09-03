import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SequenceService } from '../../common/sequence/sequence.service';
import { Carrier } from './entities/carrier.entity';
import { FreightRate } from './entities/freight-rate.entity';
import { ShipmentPlan, ShipmentPlanStatus } from './entities/shipment-plan.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface FreightQuote {
  carrierId: string;
  carrierCode: string;
  carrierName: string;
  serviceLevel: string;
  transitDays: number;
  cost: number;
  currency: string;
  rateId: string;
}

@Injectable()
export class LogisticsService {
  constructor(
    @InjectRepository(Carrier) private readonly carrierRepo: Repository<Carrier>,
    @InjectRepository(FreightRate) private readonly rateRepo: Repository<FreightRate>,
    @InjectRepository(ShipmentPlan) private readonly planRepo: Repository<ShipmentPlan>,
    private readonly sequence: SequenceService,
  ) {}

  // ─── Ph-151: Carrier master ───────────────────────────────────────

  listCarriers(tenantId: string): Promise<Carrier[]> {
    return this.carrierRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async createCarrier(tenantId: string, data: Partial<Carrier>): Promise<Carrier> {
    if (!data.code) throw new BadRequestException('code is required');
    const dup = await this.carrierRepo.findOne({ where: { tenantId, code: data.code } });
    if (dup) throw new BadRequestException(`Carrier ${data.code} already exists`);
    const c = this.carrierRepo.create({ tenantId, serviceLevel: 'STANDARD', transitDays: 3, isActive: true, ...data } as any) as unknown as Carrier;
    return (this.carrierRepo.save(c) as unknown) as Promise<Carrier>;
  }

  async updateCarrier(tenantId: string, id: string, data: Partial<Carrier>): Promise<Carrier> {
    const c = await this.carrierRepo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Carrier ${id} not found`);
    Object.assign(c, data);
    return (this.carrierRepo.save(c) as unknown) as Promise<Carrier>;
  }

  // ─── Ph-152: Freight rates + rate shopping ────────────────────────

  listRates(tenantId: string, carrierId?: string): Promise<FreightRate[]> {
    const where: any = { tenantId };
    if (carrierId) where.carrierId = carrierId;
    return this.rateRepo.find({ where, order: { originZone: 'ASC', destZone: 'ASC' } });
  }

  async createRate(tenantId: string, data: Partial<FreightRate>): Promise<FreightRate> {
    if (!data.carrierId) throw new BadRequestException('carrierId is required');
    if (!data.originZone || !data.destZone) throw new BadRequestException('originZone and destZone are required');
    const r = this.rateRepo.create({
      tenantId, minWeight: 0, maxWeight: 999999, flatRate: 0, ratePerKg: 0, minCharge: 0, fuelSurchargePct: 0, currency: 'USD', isActive: true, ...data,
    } as any) as unknown as FreightRate;
    return (this.rateRepo.save(r) as unknown) as Promise<FreightRate>;
  }

  /** Pure cost computation for a rate at a given weight. */
  computeRateCost(rate: FreightRate, weight: number): number {
    const base = Number(rate.flatRate) + Number(rate.ratePerKg) * weight;
    const withFuel = base * (1 + Number(rate.fuelSurchargePct) / 100);
    return round2(Math.max(withFuel, Number(rate.minCharge)));
  }

  /**
   * Rate-shop: find all carriers that serve origin→dest in the weight band and
   * return their quotes sorted cheapest-first.
   */
  async rateShop(tenantId: string, params: { originZone: string; destZone: string; weight: number }): Promise<FreightQuote[]> {
    if (!params.weight || params.weight <= 0) throw new BadRequestException('weight must be > 0');
    const rates = await this.rateRepo.find({
      where: { tenantId, originZone: params.originZone, destZone: params.destZone, isActive: true },
    });
    const eligible = rates.filter((r) => params.weight >= Number(r.minWeight) && params.weight <= Number(r.maxWeight));
    if (eligible.length === 0) return [];
    const carriers = await this.carrierRepo.find({ where: { tenantId, isActive: true } });
    const carrierMap = new Map(carriers.map((c) => [c.id, c]));

    const quotes: FreightQuote[] = [];
    for (const r of eligible) {
      const c = carrierMap.get(r.carrierId);
      if (!c) continue;
      quotes.push({
        carrierId: c.id, carrierCode: c.code, carrierName: c.name, serviceLevel: c.serviceLevel,
        transitDays: c.transitDays, cost: this.computeRateCost(r, params.weight), currency: r.currency, rateId: r.id,
      });
    }
    return quotes.sort((a, b) => a.cost - b.cost);
  }

  // ─── Ph-153: Shipment planning ────────────────────────────────────

  listPlans(tenantId: string, status?: ShipmentPlanStatus): Promise<ShipmentPlan[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.planRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /**
   * Build a shipment plan from a set of deliveries, auto-selecting the cheapest
   * carrier and computing weight/volume utilization against vehicle capacity.
   */
  async planShipment(tenantId: string, data: {
    deliveryIds: string[]; originZone: string; destZone: string;
    totalWeight: number; totalVolume?: number; weightCapacity?: number; volumeCapacity?: number;
    carrierId?: string; shipDate?: string;
  }): Promise<ShipmentPlan> {
    if (!data.deliveryIds?.length) throw new BadRequestException('At least one delivery is required');
    if (!data.totalWeight || data.totalWeight <= 0) throw new BadRequestException('totalWeight must be > 0');

    // pick carrier: explicit, else cheapest from rate shop
    let carrierId = data.carrierId ?? null;
    let plannedCost = 0;
    const quotes = await this.rateShop(tenantId, { originZone: data.originZone, destZone: data.destZone, weight: data.totalWeight });
    if (carrierId) {
      const q = quotes.find((x) => x.carrierId === carrierId);
      plannedCost = q?.cost ?? 0;
    } else if (quotes.length > 0) {
      carrierId = quotes[0].carrierId;
      plannedCost = quotes[0].cost;
    }

    const weightCap = data.weightCapacity ?? 0;
    const volCap = data.volumeCapacity ?? 0;
    const totalVol = data.totalVolume ?? 0;
    const weightUtil = weightCap > 0 ? round2((data.totalWeight / weightCap) * 100) : 0;
    const volUtil = volCap > 0 ? round2((totalVol / volCap) * 100) : 0;
    if (weightCap > 0 && data.totalWeight > weightCap) {
      throw new BadRequestException(`Total weight ${data.totalWeight} exceeds vehicle capacity ${weightCap}`);
    }

    const number = await this.nextShipmentNumber(tenantId);
    const plan = this.planRepo.create({
      tenantId, shipmentNumber: number, carrierId,
      originZone: data.originZone, destZone: data.destZone,
      deliveryIds: data.deliveryIds, totalWeight: data.totalWeight, totalVolume: totalVol,
      weightCapacity: weightCap, volumeCapacity: volCap,
      weightUtilizationPct: weightUtil, volumeUtilizationPct: volUtil,
      plannedFreightCost: plannedCost, status: ShipmentPlanStatus.PLANNED, shipDate: data.shipDate ?? null,
    } as any) as unknown as ShipmentPlan;
    return (this.planRepo.save(plan) as unknown) as Promise<ShipmentPlan>;
  }

  async transitionPlan(tenantId: string, id: string, status: ShipmentPlanStatus): Promise<ShipmentPlan> {
    const plan = await this.planRepo.findOne({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException(`Shipment plan ${id} not found`);
    plan.status = status;
    return (this.planRepo.save(plan) as unknown) as Promise<ShipmentPlan>;
  }

  // ─── Ph-154: Freight audit ────────────────────────────────────────

  /** Compare a carrier's invoiced freight to the planned cost; flag variance. */
  async freightAudit(tenantId: string, id: string, invoicedAmount: number, tolerancePct = 5): Promise<any> {
    const plan = await this.planRepo.findOne({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException(`Shipment plan ${id} not found`);
    plan.actualFreightCost = round2(invoicedAmount);
    await this.planRepo.save(plan);
    const planned = Number(plan.plannedFreightCost);
    const variance = round2(invoicedAmount - planned);
    const variancePct = planned > 0 ? round2((variance / planned) * 100) : 0;
    return {
      shipmentNumber: plan.shipmentNumber,
      plannedFreightCost: planned,
      invoicedAmount: round2(invoicedAmount),
      variance,
      variancePct,
      withinTolerance: Math.abs(variancePct) <= tolerancePct,
      recommendation: Math.abs(variancePct) <= tolerancePct ? 'APPROVE' : 'DISPUTE',
    };
  }

  private async nextShipmentNumber(tenantId: string): Promise<string> {
    return this.sequence.formatted(tenantId, 'shipment-plan', 'SHP-', 6);
  }
}
