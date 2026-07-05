import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum SurveyType {
  PULSE      = 'PULSE',
  ENGAGEMENT = 'ENGAGEMENT',
  ENPS       = 'ENPS',
  CUSTOM     = 'CUSTOM',
}

export enum SurveyStatus {
  DRAFT  = 'DRAFT',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

export type SurveyQuestionType = 'RATING' | 'SCALE_10' | 'YES_NO' | 'TEXT';

export interface SurveyQuestion {
  id: string;
  text: string;
  type: SurveyQuestionType;
  required?: boolean;
}

@Entity('eng_surveys')
@Index(['tenantId', 'status'])
export class Survey {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column() title: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'enum', enum: SurveyType, default: SurveyType.PULSE }) type: SurveyType;
  @Column({ type: 'enum', enum: SurveyStatus, default: SurveyStatus.DRAFT }) status: SurveyStatus;
  // Anonymous surveys never store who answered — only a hash used to prevent double submission.
  @Column({ default: true }) anonymous: boolean;
  @Column({ type: 'jsonb' }) questions: SurveyQuestion[];
  @Column({ name: 'start_date', type: 'date', nullable: true }) startDate: string | null;
  @Column({ name: 'end_date', type: 'date', nullable: true }) endDate: string | null;
  @Column({ name: 'created_by_id', nullable: true }) createdById: string | null;
  @CreateDateColumn() createdAt: Date;
}
