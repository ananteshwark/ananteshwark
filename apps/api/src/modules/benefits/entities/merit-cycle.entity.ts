import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum MeritCycleStatus {
  DRAFT     = 'DRAFT',
  OPEN      = 'OPEN',
  REVIEW    = 'REVIEW',
  APPROVED  = 'APPROVED',
  CLOSED    = 'CLOSED',
}

@Entity('comp_merit_cycles')
@Index(['tenantId', 'name'], { unique: true })
export class MeritCycle {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column() name: string;
  @Column({ type: 'int' }) year: number;
  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ name: 'end_date', type: 'date' }) endDate: string;
  @Column({ type: 'enum', enum: MeritCycleStatus, default: MeritCycleStatus.DRAFT }) status: MeritCycleStatus;
  @Column({ name: 'budget_pct', type: 'numeric', precision: 5, scale: 2, default: 3.0 }) budgetPct: number;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
}
