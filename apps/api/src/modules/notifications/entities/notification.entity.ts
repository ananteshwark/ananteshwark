import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum NotificationType {
  IN_APP = 'in_app',
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: NotificationType, default: NotificationType.IN_APP })
  type: NotificationType;

  @Column({ length: 255 })
  title: string;

  @Column('text')
  body: string;

  @Column({ type: 'jsonb', default: {} })
  data: any;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @Column({ name: 'read_at', nullable: true })
  readAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
