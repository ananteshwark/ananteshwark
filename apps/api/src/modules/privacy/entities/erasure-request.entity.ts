import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ErasureStatus {
  PENDING = 'PENDING',       // within retention period
  ANONYMIZED = 'ANONYMIZED',
  CANCELLED = 'CANCELLED',
}

/**
 * Ph-271 — A right-to-erasure request; PII is anonymized once the retention
 * period lapses.
 */
@Entity('privacy_erasure_requests')
@Index(['tenantId', 'subjectId'])
@Index(['tenantId', 'status'])
export class ErasureRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'subject_id', type: 'varchar' })
  subjectId: string;

  @Column({ name: 'subject_type', length: 40, default: 'CUSTOMER' })
  subjectType: string;

  @Column({ name: 'retention_until', type: 'date' })
  retentionUntil: string;

  @Column({ type: 'enum', enum: ErasureStatus, default: ErasureStatus.PENDING })
  status: ErasureStatus;

  @Column({ name: 'anonymized_at', type: 'timestamp', nullable: true })
  anonymizedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
