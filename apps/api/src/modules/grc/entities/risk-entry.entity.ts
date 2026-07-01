import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-288 — An enterprise risk register entry with a likelihood×impact score.
 */
@Entity('grc_risks')
@Index(['tenantId'])
export class RiskEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 200 })
  title: string;

  @Column({ length: 60, nullable: true })
  category: string | null;

  @Column({ type: 'int' })
  likelihood: number; // 1–5

  @Column({ type: 'int' })
  impact: number; // 1–5

  @Column({ type: 'int', default: 0 })
  score: number; // likelihood × impact

  @Column({ length: 20 })
  level: string; // LOW / MEDIUM / HIGH / CRITICAL

  @Column({ name: 'mitigating_control_ids', type: 'jsonb', default: [] })
  mitigatingControlIds: string[];

  @Column({ name: 'owner_id', type: 'varchar', nullable: true })
  ownerId: string | null;

  @Column({ length: 20, default: 'OPEN' })
  status: string; // OPEN / MITIGATED / ACCEPTED / CLOSED

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
