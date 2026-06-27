import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Ph-151 — Carrier master.
 * Oracle OTM equivalent: service provider with service levels and transit times.
 */
@Entity('log_carriers')
@Index(['tenantId', 'code'], { unique: true })
export class Carrier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 40 })
  code: string;

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'service_level', length: 40, default: 'STANDARD' })
  serviceLevel: string; // STANDARD / EXPRESS / ECONOMY

  @Column({ name: 'transit_days', type: 'int', default: 3 })
  transitDays: number;

  @Column({ name: 'scac_code', length: 10, nullable: true })
  scacCode: string | null; // Standard Carrier Alpha Code

  @Column({ name: 'tracking_url', length: 255, nullable: true })
  trackingUrl: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
