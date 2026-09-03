import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-215 — A manager's override of a rep's commit forecast for a period.
 */
@Entity('crm_forecast_overrides')
@Index(['tenantId', 'ownerId', 'period'], { unique: true })
export class ForecastOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'manager_id', type: 'varchar' })
  managerId: string;

  @Column({ name: 'owner_id', type: 'varchar' })
  ownerId: string;

  @Column({ length: 7 })
  period: string;

  @Column({ name: 'override_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  overrideAmount: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
