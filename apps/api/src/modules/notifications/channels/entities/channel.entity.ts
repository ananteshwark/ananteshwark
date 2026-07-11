import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum NotificationChannel {
  TEAMS = 'TEAMS',
  SLACK = 'SLACK',
  WEB_PUSH = 'WEB_PUSH',
  EMAIL = 'EMAIL',
}

/** A user's opt-in to receive notifications on an external channel. */
@Entity('nt_channel_subscriptions')
@Index(['tenantId', 'userId'])
@Index(['tenantId', 'userId', 'channel'], { unique: true })
export class ChannelSubscription {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'user_id' }) userId: string;
  @Column({ type: 'enum', enum: NotificationChannel }) channel: NotificationChannel;
  // Channel target: { webhookUrl } for Teams/Slack, { endpoint, keys } for web push, { address } for email.
  @Column({ type: 'jsonb', default: () => "'{}'" }) target: Record<string, any>;
  @Column({ default: true }) enabled: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum ChannelDeliveryStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED', // no transport wired / channel disabled
}

/** An audit record of one attempt to deliver a message on a channel. */
@Entity('nt_channel_deliveries')
@Index(['tenantId', 'userId'])
export class ChannelDelivery {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'user_id' }) userId: string;
  @Column({ type: 'enum', enum: NotificationChannel }) channel: NotificationChannel;
  @Column({ length: 255 }) title: string;
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'enum', enum: ChannelDeliveryStatus, default: ChannelDeliveryStatus.QUEUED }) status: ChannelDeliveryStatus;
  @Column({ length: 200, nullable: true }) reference: string | null;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true }) sentAt: Date | null;
  @CreateDateColumn() createdAt: Date;
}
