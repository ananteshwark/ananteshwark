import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/** Per-tenant, per-month meter for CV-parsing (metered AI) calls. */
@Entity('ai_cv_parse_usage')
@Index(['tenantId', 'month'], { unique: true })
export class CvParseUsage {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 7 }) month: string; // YYYY-MM
  @Column({ type: 'int', default: 0 }) count: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
