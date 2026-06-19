import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ReadinessLevel {
  READY_NOW = 'READY_NOW',
  READY_1_2_YEARS = 'READY_1_2_YEARS',
  READY_3_5_YEARS = 'READY_3_5_YEARS',
}

@Entity('tal_successor_candidates')
export class SuccessorCandidate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @Column({ name: 'employee_id', type: 'varchar' })
  employeeId: string;

  @Column({ name: 'readiness_level', type: 'enum', enum: ReadinessLevel, default: ReadinessLevel.READY_1_2_YEARS })
  readinessLevel: ReadinessLevel;

  @Column({ name: 'development_actions', type: 'text', nullable: true })
  developmentActions: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
