import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum EmailStatus {
  SENT = 'SENT',
  FAILED = 'FAILED',
}

@Entity('email_logs')
@Index(['tenantId', 'sentAt'])
export class EmailLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'template_code', length: 100, nullable: true })
  templateCode: string;

  @Column({ name: 'to_email' })
  toEmail: string;

  @Column()
  subject: string;

  @Column({ type: 'enum', enum: EmailStatus })
  status: EmailStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'sent_at' })
  sentAt: Date;
}
