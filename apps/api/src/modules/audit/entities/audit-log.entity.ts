import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string;

  @Column({ name: 'user_email', nullable: true })
  userEmail: string;

  @Column({ length: 50 })
  action: string;

  @Column({ name: 'resource_type', length: 100 })
  resourceType: string;

  @Column({ name: 'resource_id', nullable: true })
  resourceId: string;

  @Column({ name: 'old_values', type: 'jsonb', nullable: true })
  oldValues: any;

  @Column({ name: 'new_values', type: 'jsonb', nullable: true })
  newValues: any;

  @Column({ name: 'ip_address', nullable: true })
  ipAddress: string;

  @Column({ name: 'user_agent', nullable: true })
  userAgent: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;
}
