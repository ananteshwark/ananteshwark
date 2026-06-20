import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum DunningRunStatus {
  DRAFT  = 'DRAFT',
  SENT   = 'SENT',
  CLOSED = 'CLOSED',
}

export enum DunningLetterStatus {
  PENDING = 'PENDING',
  SENT    = 'SENT',
  PAID    = 'PAID',
  DISPUTED = 'DISPUTED',
}

@Entity('ar_dunning_runs')
export class DunningRun {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'run_date', type: 'date' }) runDate: string;
  @Column({ type: 'enum', enum: DunningRunStatus, default: DunningRunStatus.DRAFT }) status: DunningRunStatus;
  @Column({ name: 'total_overdue', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) totalOverdue: number;
  @Column({ name: 'customer_count', type: 'int', default: 0 }) customerCount: number;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
}

@Entity('ar_dunning_letters')
export class DunningLetter {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'run_id', type: 'uuid' }) runId: string;
  @Column({ name: 'customer_id', type: 'uuid' }) customerId: string;
  @Column({ name: 'customer_name', length: 200 }) customerName: string;
  @Column({ name: 'dunning_level_id', type: 'uuid' }) dunningLevelId: string;
  @Column({ name: 'level_number', type: 'int' }) levelNumber: number;
  @Column({ name: 'overdue_amount', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) overdueAmount: number;
  @Column({ name: 'invoice_ids', type: 'jsonb', default: [] }) invoiceIds: string[];
  @Column({ type: 'enum', enum: DunningLetterStatus, default: DunningLetterStatus.PENDING }) status: DunningLetterStatus;
  @Column({ name: 'sent_at', type: 'timestamp', nullable: true }) sentAt: Date | null;
  @CreateDateColumn() createdAt: Date;
}
