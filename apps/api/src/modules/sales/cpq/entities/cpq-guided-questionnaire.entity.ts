import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export interface GuidedAnswer {
  value: string;
  modelCode: string;
  weight: number;
}

export interface GuidedQuestion {
  id: string;
  text: string;
  answers: GuidedAnswer[];
}

/**
 * Ph-222 — A guided-selling questionnaire; answers carry weighted votes toward
 * candidate product models.
 */
@Entity('cpq_guided_questionnaires')
@Index(['tenantId', 'code'], { unique: true })
export class CpqGuidedQuestionnaire {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'jsonb', default: [] })
  questions: GuidedQuestion[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
