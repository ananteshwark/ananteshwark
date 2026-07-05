import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('eng_survey_responses')
@Index(['tenantId', 'surveyId'])
@Index(['surveyId', 'respondentKey'], { unique: true })
export class SurveyResponse {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'survey_id' }) surveyId: string;
  // Deterministic hash of (surveyId, userId): blocks double submission without
  // revealing identity on anonymous surveys.
  @Column({ name: 'respondent_key', length: 64 }) respondentKey: string;
  // Only populated when the survey is NOT anonymous.
  @Column({ name: 'respondent_user_id', nullable: true }) respondentUserId: string | null;
  @Column({ type: 'jsonb' }) answers: Record<string, any>;
  @CreateDateColumn() submittedAt: Date;
}
