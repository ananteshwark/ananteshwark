import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum ResponseStatus {
  PASSED = 'PASSED',
  REVIEW = 'REVIEW',   // below threshold — routed for manual review
  REJECTED = 'REJECTED',
  APPROVED = 'APPROVED', // reviewer override to qualified
}

/**
 * Ph-203 — A supplier's answers to a questionnaire, auto-scored pass/fail.
 */
@Entity('proc_questionnaire_responses')
@Index(['tenantId', 'questionnaireId', 'supplierId'])
export class QuestionnaireResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'questionnaire_id', type: 'uuid' })
  questionnaireId: string;

  @Column({ name: 'supplier_id', type: 'varchar' })
  supplierId: string;

  @Column({ type: 'jsonb', default: [] })
  answers: Array<{ questionId: string; value: any }>;

  @Column({ name: 'score_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer })
  scorePct: number;

  @Column({ type: 'enum', enum: ResponseStatus, default: ResponseStatus.REVIEW })
  status: ResponseStatus;

  @Column({ name: 'failed_questions', type: 'jsonb', default: [] })
  failedQuestions: string[];

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
