import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('lic_audit_logs')
@Index(['tenantId', 'entityType', 'entityId'])
export class LicenseAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'event_type', length: 100 })
  eventType: string;

  @Column({ name: 'entity_type', length: 100 })
  entityType: string;

  @Column({ name: 'entity_id', nullable: true })
  entityId: string | null;

  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue: any | null;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue: any | null;

  @Column({ nullable: true, type: 'text' })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
