import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ActivityType {
  CALL = 'CALL',
  EMAIL = 'EMAIL',
  MEETING = 'MEETING',
  NOTE = 'NOTE',
  TASK = 'TASK',
}

export enum ActivityStatus {
  PLANNED = 'PLANNED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('crm_activities')
export class CrmActivity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'contact_id', type: 'uuid', nullable: true }) contactId: string | null;
  @Column({ name: 'opportunity_id', type: 'uuid', nullable: true }) opportunityId: string | null;
  @Column({ type: 'enum', enum: ActivityType }) type: ActivityType;
  @Column({ length: 300 }) subject: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'activity_date', type: 'date' }) activityDate: string;
  @Column({ name: 'due_date', type: 'date', nullable: true }) dueDate: string | null;
  @Column({ type: 'enum', enum: ActivityStatus, default: ActivityStatus.PLANNED }) status: ActivityStatus;
  @Column({ type: 'text', nullable: true }) outcome: string | null;
  @Column({ name: 'created_by_id', type: 'varchar' }) createdById: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
