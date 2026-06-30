import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export interface QuestionDef {
  id: string;
  text: string;
  type: 'BOOLEAN' | 'NUMERIC' | 'CHOICE';
  weight: number;
  passValue: any; // BOOLEAN: true; NUMERIC: min threshold; CHOICE: accepted option
  options?: string[];
}

/**
 * Ph-202 — A supplier qualification questionnaire template, scoped to a
 * commodity/category. Questions are weighted and pass-scored.
 */
@Entity('proc_questionnaires')
@Index(['tenantId', 'category'])
export class Questionnaire {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ length: 100, nullable: true })
  category: string | null; // commodity / category

  @Column({ type: 'jsonb', default: [] })
  questions: QuestionDef[];

  @Column({ name: 'pass_threshold_pct', type: 'numeric', precision: 5, scale: 2, default: 70, transformer: decimalTransformer })
  passThresholdPct: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
