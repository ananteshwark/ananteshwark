import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('notification_templates')
export class NotificationTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: string;

  @Column({ length: 100, unique: true })
  code: string;

  @Column({ name: 'subject_template', length: 500 })
  subjectTemplate: string;

  @Column({ name: 'body_template', type: 'text' })
  bodyTemplate: string;

  @Column({ type: 'jsonb', default: [] })
  variables: string[];

  @Column({ type: 'simple-array', default: 'in_app' })
  channels: string[];

  @Column({ default: 'en' })
  locale: string;

  @CreateDateColumn()
  createdAt: Date;
}
