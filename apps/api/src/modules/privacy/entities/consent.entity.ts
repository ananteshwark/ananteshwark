import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-270 — A data subject's consent for a processing purpose.
 */
@Entity('privacy_consents')
@Index(['tenantId', 'subjectId', 'purpose'], { unique: true })
export class Consent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'subject_id', type: 'varchar' })
  subjectId: string;

  @Column({ name: 'subject_type', length: 40, default: 'CUSTOMER' })
  subjectType: string;

  @Column({ length: 100 })
  purpose: string; // MARKETING / ANALYTICS / PROFILING / ...

  @Column({ default: false })
  granted: boolean;

  @Column({ name: 'granted_at', type: 'timestamp', nullable: true })
  grantedAt: Date | null;

  @Column({ name: 'withdrawn_at', type: 'timestamp', nullable: true })
  withdrawnAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
