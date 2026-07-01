import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export interface BpmStage {
  id: string;
  name: string;
  swimlane?: string;
  approvers: string[];
  mode: 'ALL' | 'ANY';
  escalationHours?: number;
  escalateTo?: string;
}

/**
 * Ph-259 — A BPM process definition: an ordered set of approval stages plus
 * designer metadata (swimlanes, gateways) from the graphical builder.
 */
@Entity('bpm_processes')
@Index(['tenantId', 'code'], { unique: true })
export class BpmProcess {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 60 })
  code: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'jsonb', default: [] })
  stages: BpmStage[];

  @Column({ type: 'jsonb', default: [] })
  swimlanes: string[];

  /** [{ id, type: 'EXCLUSIVE'|'PARALLEL', fromStage, branches }] — designer metadata. */
  @Column({ type: 'jsonb', default: [] })
  gateways: any[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
