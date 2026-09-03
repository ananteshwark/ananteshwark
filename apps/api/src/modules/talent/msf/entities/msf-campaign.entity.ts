import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum MsfStatus {
  DRAFT = 'DRAFT',           // building the rater list
  COLLECTING = 'COLLECTING', // raters submitting
  CLOSED = 'CLOSED',         // report available
}

export enum RaterRelationship {
  SELF = 'SELF',
  MANAGER = 'MANAGER',
  PEER = 'PEER',
  DIRECT_REPORT = 'DIRECT_REPORT',
  STAKEHOLDER = 'STAKEHOLDER',
}

/**
 * A multi-source (360°) feedback campaign for one subject. Raters across
 * relationship groups score the subject on a shared competency set; the report
 * aggregates per group under an anonymity threshold.
 */
@Entity('tal_msf_campaigns')
@Index(['tenantId', 'status'])
export class MsfCampaign {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'subject_employee_id', type: 'uuid' }) subjectEmployeeId: string;
  @Column({ name: 'subject_name', length: 200 }) subjectName: string;
  @Column({ type: 'enum', enum: MsfStatus, default: MsfStatus.DRAFT }) status: MsfStatus;
  // Competencies rated, e.g. [{ key:'collaboration', label:'Collaboration' }].
  @Column({ type: 'jsonb', default: () => "'[]'" }) competencies: Array<{ key: string; label: string }>;
  @Column({ name: 'rating_scale_max', type: 'int', default: 5 }) ratingScaleMax: number;
  // Min raters in a relationship group before its aggregate is shown (SELF exempt).
  @Column({ name: 'anonymity_threshold', type: 'int', default: 3 }) anonymityThreshold: number;
  @Column({ name: 'due_date', type: 'date', nullable: true }) dueDate: string | null;
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true }) closedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum RaterStatus {
  INVITED = 'INVITED',
  SUBMITTED = 'SUBMITTED',
  DECLINED = 'DECLINED',
}

@Entity('tal_msf_raters')
@Index(['tenantId', 'campaignId'])
export class MsfRater {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'campaign_id', type: 'uuid' }) campaignId: string;
  @Column({ name: 'rater_employee_id', type: 'uuid' }) raterEmployeeId: string;
  @Column({ name: 'rater_name', length: 200, nullable: true }) raterName: string | null;
  @Column({ type: 'enum', enum: RaterRelationship, default: RaterRelationship.PEER }) relationship: RaterRelationship;
  @Column({ type: 'enum', enum: RaterStatus, default: RaterStatus.INVITED }) status: RaterStatus;
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true }) submittedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('tal_msf_responses')
@Index(['tenantId', 'campaignId'])
export class MsfResponse {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'campaign_id', type: 'uuid' }) campaignId: string;
  @Column({ name: 'rater_id', type: 'uuid' }) raterId: string;
  @Column({ type: 'enum', enum: RaterRelationship, default: RaterRelationship.PEER }) relationship: RaterRelationship;
  // Per-competency scores, e.g. [{ competencyKey:'collaboration', score:4 }].
  @Column({ type: 'jsonb', default: () => "'[]'" }) ratings: Array<{ competencyKey: string; score: number }>;
  @Column({ type: 'text', nullable: true }) strengths: string | null;
  @Column({ type: 'text', nullable: true }) improvements: string | null;
  @CreateDateColumn() createdAt: Date;
}
