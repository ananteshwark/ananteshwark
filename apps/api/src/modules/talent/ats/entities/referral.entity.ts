import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ReferralStatus {
  SUBMITTED = 'SUBMITTED', // candidate referred, application created
  HIRED = 'HIRED',         // referred candidate was hired (bonus eligible)
  CLOSED = 'CLOSED',       // not hired / withdrawn
}

/**
 * Employee referral: links a referring employee to a candidate they referred
 * for a job. On hire the referral becomes bonus-eligible for the posting's
 * referral bonus.
 */
@Entity('tal_referrals')
@Index(['tenantId', 'jobPostingId'])
export class Referral {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'job_posting_id', type: 'uuid' }) jobPostingId: string;
  @Column({ name: 'referrer_user_id' }) referrerUserId: string;
  @Column({ name: 'referrer_name', length: 200 }) referrerName: string;
  @Column({ name: 'candidate_name', length: 200 }) candidateName: string;
  @Column({ name: 'candidate_email', length: 200 }) candidateEmail: string;
  @Column({ name: 'applicant_id', type: 'uuid', nullable: true }) applicantId: string | null;
  @Column({ type: 'enum', enum: ReferralStatus, default: ReferralStatus.SUBMITTED }) status: ReferralStatus;
  @Column({ name: 'bonus_amount', type: 'decimal', precision: 18, scale: 2, default: 0 }) bonusAmount: number;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
