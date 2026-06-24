import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('platform_webhook_subscriptions')
@Index(['tenantId', 'isActive'])
export class WebhookSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'target_url', type: 'text' })
  targetUrl: string;

  // JSON array of event type strings e.g. ["employee.created", "po.approved"]
  @Column({ name: 'event_types', type: 'json' })
  eventTypes: string[];

  // HMAC secret for signing — stored as plain text; client should treat it as a secret
  @Column({ name: 'secret', length: 100 })
  secret: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'max_retries', type: 'int', default: 3 })
  maxRetries: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
