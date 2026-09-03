import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum OwnerType {
  COMPANY = 'COMPANY',
  DEPARTMENT = 'DEPARTMENT',
  TEAM = 'TEAM',
  INDIVIDUAL = 'INDIVIDUAL',
}

export enum ObjectiveStatus {
  ON_TRACK = 'ON_TRACK',
  AT_RISK = 'AT_RISK',
  BEHIND = 'BEHIND',
  ACHIEVED = 'ACHIEVED',
  CANCELLED = 'CANCELLED',
}

@Entity('tal_objectives')
export class Objective {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'cycle_id', type: 'uuid' })
  cycleId: string;

  @Column({ length: 300 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'owner_id', type: 'varchar' })
  ownerId: string;

  @Column({ name: 'owner_type', type: 'enum', enum: OwnerType, default: OwnerType.INDIVIDUAL })
  ownerType: OwnerType;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column({ name: 'parent_objective_id', type: 'uuid', nullable: true })
  parentObjectiveId: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 1 })
  weight: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  progress: number;

  @Column({ type: 'enum', enum: ObjectiveStatus, default: ObjectiveStatus.ON_TRACK })
  status: ObjectiveStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
