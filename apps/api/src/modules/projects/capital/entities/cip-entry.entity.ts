import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';
import { CostTreatment } from './capital-config.entity';

export enum CipStatus {
  ACCUMULATED = 'ACCUMULATED',
  TRANSFERRED = 'TRANSFERRED', // moved from CIP to an in-service asset
}

/**
 * Ph-249 — An accumulated project cost, classified capitalize/expense.
 * Capitalized costs sit in CIP until transferred to a fixed asset.
 */
@Entity('pjt_cip_entries')
@Index(['tenantId', 'projectId', 'status'])
export class CipEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'task_id', type: 'varchar', nullable: true })
  taskId: string | null;

  @Column({ length: 7 })
  period: string; // YYYY-MM

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number;

  @Column({ type: 'enum', enum: CostTreatment })
  treatment: CostTreatment;

  @Column({ type: 'enum', enum: CipStatus, default: CipStatus.ACCUMULATED })
  status: CipStatus;

  @Column({ name: 'asset_ref', length: 100, nullable: true })
  assetRef: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
