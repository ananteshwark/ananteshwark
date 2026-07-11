import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Per-tenant, per-month meter for receipt-OCR calls. OCR is a metered
 * (billable) AI feature, so usage is counted and capped against a monthly
 * quota.
 */
@Entity('ai_ocr_usage')
@Index(['tenantId', 'month'], { unique: true })
export class OcrUsage {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 7 }) month: string; // YYYY-MM
  @Column({ type: 'int', default: 0 }) count: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
