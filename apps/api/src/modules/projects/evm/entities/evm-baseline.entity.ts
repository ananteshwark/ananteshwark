import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum EvmBaselineStatus {
  ACTIVE = 'ACTIVE',
  SUPERSEDED = 'SUPERSEDED',
}

/**
 * Ph-245 — A performance measurement baseline (PMB) for a project: the total
 * budget at completion (BAC) frozen from the approved schedule.
 */
@Entity('pjt_evm_baselines')
@Index(['tenantId', 'projectId', 'version'], { unique: true })
export class EvmBaseline {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'enum', enum: EvmBaselineStatus, default: EvmBaselineStatus.ACTIVE })
  status: EvmBaselineStatus;

  @Column({ name: 'bac', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  bac: number; // budget at completion

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
