import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum OfferStatus {
  DRAFTED = 'DRAFTED',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  REVOKED = 'REVOKED',
}

@Entity('tal_job_offers')
export class JobOffer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'applicant_id', type: 'uuid' })
  applicantId: string;

  @Column({ name: 'job_posting_id', type: 'uuid' })
  jobPostingId: string;

  @Column({ name: 'offered_salary', type: 'decimal', precision: 18, scale: 2 })
  offeredSalary: number;

  @Column({ name: 'joining_date', type: 'date' })
  joiningDate: string;

  @Column({ name: 'offer_date', type: 'date' })
  offerDate: string;

  @Column({ name: 'valid_until', type: 'date' })
  validUntil: string;

  @Column({ type: 'enum', enum: OfferStatus, default: OfferStatus.DRAFTED })
  status: OfferStatus;

  @Column({ type: 'text', nullable: true })
  terms: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
