import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum InterviewType {
  PHONE = 'PHONE',
  VIDEO = 'VIDEO',
  IN_PERSON = 'IN_PERSON',
  TECHNICAL = 'TECHNICAL',
  HR = 'HR',
}

export enum InterviewStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export enum InterviewRecommendation {
  ADVANCE = 'ADVANCE',
  REJECT = 'REJECT',
  HOLD = 'HOLD',
}

@Entity('tal_interviews')
export class InterviewSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'applicant_id', type: 'uuid' })
  applicantId: string;

  @Column({ name: 'job_posting_id', type: 'uuid' })
  jobPostingId: string;

  @Column({ default: 1 })
  round: number;

  @Column({ name: 'interview_type', type: 'enum', enum: InterviewType, default: InterviewType.VIDEO })
  interviewType: InterviewType;

  @Column({ name: 'scheduled_at', type: 'timestamp' })
  scheduledAt: Date;

  @Column({ name: 'duration_minutes', default: 60 })
  durationMinutes: number;

  @Column({ name: 'interviewer_ids', type: 'jsonb', default: '[]' })
  interviewerIds: string[];

  @Column({ length: 200, nullable: true })
  location: string | null;

  @Column({ name: 'meeting_link', type: 'text', nullable: true })
  meetingLink: string | null;

  @Column({ type: 'enum', enum: InterviewStatus, default: InterviewStatus.SCHEDULED })
  status: InterviewStatus;

  @Column({ type: 'text', nullable: true })
  feedback: string | null;

  @Column({ nullable: true })
  rating: number | null;

  @Column({ type: 'enum', enum: InterviewRecommendation, nullable: true })
  recommendation: InterviewRecommendation | null;

  // Structured evaluation: { criterion: score(1-5) } filled from a rubric.
  @Column({ name: 'evaluation_scores', type: 'jsonb', nullable: true })
  evaluationScores: Record<string, number> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
