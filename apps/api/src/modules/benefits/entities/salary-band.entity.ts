import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('comp_salary_bands')
@Index(['tenantId', 'grade', 'level'], { unique: true })
export class SalaryBand {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) grade: string;
  @Column({ length: 50 }) level: string;
  @Column({ name: 'job_family', nullable: true }) jobFamily: string | null;
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) minimum: number;
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) midpoint: number;
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) maximum: number;
  @Column({ length: 3, default: 'USD' }) currency: string;
  @Column({ name: 'effective_from', type: 'date' }) effectiveFrom: string;
  @Column({ name: 'effective_to', type: 'date', nullable: true }) effectiveTo: string | null;
  @CreateDateColumn() createdAt: Date;
}
