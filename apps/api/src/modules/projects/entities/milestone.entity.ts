import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum MilestoneStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  OVERDUE = 'OVERDUE',
}

@Entity('prj_milestones')
export class Milestone {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'due_date', type: 'date' }) dueDate: string;
  @Column({ name: 'completed_date', type: 'date', nullable: true }) completedDate: string | null;
  @Column({ type: 'enum', enum: MilestoneStatus, default: MilestoneStatus.PENDING }) status: MilestoneStatus;
  @Column({ name: 'deliverables', type: 'text', nullable: true }) deliverables: string | null;
  @Column({ name: 'owner_id', type: 'varchar', nullable: true }) ownerId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
