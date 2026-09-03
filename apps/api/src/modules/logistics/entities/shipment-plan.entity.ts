import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ShipmentPlanStatus {
  PLANNED = 'PLANNED',
  TENDERED = 'TENDERED', // offered to carrier
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

/**
 * Ph-153 — Shipment plan consolidating one or more deliveries onto a carrier,
 * with weight/volume utilization against vehicle capacity and the planned
 * freight cost from the rate engine.
 */
@Entity('log_shipment_plans')
@Index(['tenantId', 'status'])
export class ShipmentPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'shipment_number', length: 40 })
  shipmentNumber: string;

  @Column({ name: 'carrier_id', type: 'uuid', nullable: true })
  carrierId: string | null;

  @Column({ name: 'origin_zone', length: 40, nullable: true })
  originZone: string | null;

  @Column({ name: 'dest_zone', length: 40, nullable: true })
  destZone: string | null;

  @Column({ name: 'delivery_ids', type: 'jsonb', default: [] })
  deliveryIds: string[];

  @Column({ name: 'total_weight', type: 'numeric', precision: 18, scale: 3, default: 0, transformer: decimalTransformer })
  totalWeight: number;

  @Column({ name: 'total_volume', type: 'numeric', precision: 18, scale: 3, default: 0, transformer: decimalTransformer })
  totalVolume: number;

  @Column({ name: 'weight_capacity', type: 'numeric', precision: 18, scale: 3, default: 0, transformer: decimalTransformer })
  weightCapacity: number;

  @Column({ name: 'volume_capacity', type: 'numeric', precision: 18, scale: 3, default: 0, transformer: decimalTransformer })
  volumeCapacity: number;

  @Column({ name: 'weight_utilization_pct', type: 'numeric', precision: 9, scale: 2, default: 0, transformer: decimalTransformer })
  weightUtilizationPct: number;

  @Column({ name: 'volume_utilization_pct', type: 'numeric', precision: 9, scale: 2, default: 0, transformer: decimalTransformer })
  volumeUtilizationPct: number;

  @Column({ name: 'planned_freight_cost', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  plannedFreightCost: number;

  @Column({ name: 'actual_freight_cost', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer })
  actualFreightCost: number | null;

  @Column({ type: 'enum', enum: ShipmentPlanStatus, default: ShipmentPlanStatus.PLANNED })
  status: ShipmentPlanStatus;

  @Column({ name: 'ship_date', type: 'date', nullable: true })
  shipDate: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
