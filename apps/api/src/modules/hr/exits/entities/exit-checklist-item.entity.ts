import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ChecklistItemStatus {
  PENDING = 'PENDING',
  CLEARED = 'CLEARED',
}

@Entity('hr_exit_checklist_items')
@Index(['exitRequestId', 'tenantId'])
export class ExitChecklistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'exit_request_id', type: 'uuid' })
  exitRequestId: string;

  @Column({ length: 200 })
  item: string;

  @Column({ name: 'assigned_dept', length: 100, nullable: true })
  assignedDept: string | null;

  @Column({ type: 'enum', enum: ChecklistItemStatus, default: ChecklistItemStatus.PENDING })
  status: ChecklistItemStatus;

  @Column({ name: 'cleared_at', type: 'timestamptz', nullable: true })
  clearedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
