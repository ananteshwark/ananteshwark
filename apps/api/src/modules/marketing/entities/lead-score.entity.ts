import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-234 — A lead's behavioral score and grade.
 */
@Entity('mkt_lead_scores')
@Index(['tenantId', 'leadId'], { unique: true })
export class LeadScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'lead_id', type: 'varchar' })
  leadId: string;

  @Column({ type: 'int', default: 0 })
  score: number;

  @Column({ length: 1, default: 'D' })
  grade: string; // A/B/C/D

  /** [{ behavior, points, at }] */
  @Column({ type: 'jsonb', default: [] })
  behaviors: Array<{ behavior: string; points: number; at: string }>;

  @Column({ name: 'last_activity_at', type: 'timestamp', nullable: true })
  lastActivityAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
