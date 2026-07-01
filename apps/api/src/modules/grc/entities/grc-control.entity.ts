import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-287 — A GRC/SOX control with an objective, owner, test frequency, and
 * evidence.
 */
@Entity('grc_controls')
@Index(['tenantId', 'code'], { unique: true })
export class GrcControl {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 40 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  objective: string | null;

  @Column({ name: 'owner_id', type: 'varchar', nullable: true })
  ownerId: string | null;

  @Column({ name: 'test_frequency', length: 20, default: 'QUARTERLY' })
  testFrequency: string; // MONTHLY / QUARTERLY / ANNUAL

  @Column({ length: 20, default: 'NOT_TESTED' })
  status: string; // NOT_TESTED / EFFECTIVE / DEFICIENT

  @Column({ name: 'last_tested_at', type: 'date', nullable: true })
  lastTestedAt: string | null;

  @Column({ type: 'jsonb', default: [] })
  evidence: Array<{ at: string; result: string; note?: string }>;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
