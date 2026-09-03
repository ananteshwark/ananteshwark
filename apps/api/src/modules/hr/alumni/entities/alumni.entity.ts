import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum AlumniStatus {
  INVITED = 'INVITED',         // invited post-exit, not yet activated
  ACTIVE = 'ACTIVE',           // logged in / participating
  DEACTIVATED = 'DEACTIVATED',
}

/**
 * A former employee's alumni record. Created on exit as an invitation; the
 * alumnus can then maintain their profile, appear in the directory (opt-in),
 * and flag interest in returning (boomerang hiring).
 */
@Entity('hr_alumni_profiles')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'employeeId'], { unique: true })
export class AlumniProfile {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'full_name', length: 200 }) fullName: string;
  @Column({ name: 'exit_date', type: 'date', nullable: true }) exitDate: string | null;
  @Column({ name: 'last_role', length: 200, nullable: true }) lastRole: string | null;
  @Column({ name: 'tenure_months', type: 'int', nullable: true }) tenureMonths: number | null;
  @Column({ name: 'personal_email', length: 200, nullable: true }) personalEmail: string | null;
  @Column({ name: 'current_employer', length: 200, nullable: true }) currentEmployer: string | null;
  @Column({ name: 'current_title', length: 200, nullable: true }) currentTitle: string | null;
  @Column({ name: 'linkedin_url', length: 300, nullable: true }) linkedInUrl: string | null;
  @Column({ length: 120, nullable: true }) location: string | null;
  @Column({ name: 'willing_to_be_rehired', default: false }) willingToBeRehired: boolean;
  @Column({ name: 'rehire_eligible', default: true }) rehireEligible: boolean; // set by HR from exit review
  @Column({ name: 'directory_opt_in', default: false }) directoryOptIn: boolean;
  @Column({ type: 'jsonb', default: () => "'[]'" }) skills: string[];
  @Column({ type: 'enum', enum: AlumniStatus, default: AlumniStatus.INVITED }) status: AlumniStatus;
  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true }) activatedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum AlumniDocType {
  PAYSLIP = 'PAYSLIP',
  TAX_FORM = 'TAX_FORM',
  EXPERIENCE_LETTER = 'EXPERIENCE_LETTER',
  RELIEVING_LETTER = 'RELIEVING_LETTER',
  OTHER = 'OTHER',
}

/** A document made available to an alumnus (payslip, tax form, letter). */
@Entity('hr_alumni_documents')
@Index(['tenantId', 'alumniProfileId'])
export class AlumniDocument {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'alumni_profile_id', type: 'uuid' }) alumniProfileId: string;
  @Column({ name: 'doc_type', type: 'enum', enum: AlumniDocType, default: AlumniDocType.OTHER }) docType: AlumniDocType;
  @Column({ length: 200 }) title: string;
  @Column({ length: 40, nullable: true }) period: string | null; // e.g. "2025-03" for a payslip
  @Column({ name: 'file_ref', type: 'text', nullable: true }) fileRef: string | null;
  @Column({ name: 'issued_at', type: 'date', nullable: true }) issuedAt: string | null;
  @CreateDateColumn() createdAt: Date;
}

export enum AlumniTicketCategory {
  DOCUMENT_REQUEST = 'DOCUMENT_REQUEST',
  VERIFICATION = 'VERIFICATION',
  REHIRE_INTEREST = 'REHIRE_INTEREST',
  GENERAL = 'GENERAL',
}

export enum AlumniTicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

/** A request raised by an alumnus (document, verification, rehire interest). */
@Entity('hr_alumni_tickets')
@Index(['tenantId', 'alumniProfileId'])
@Index(['tenantId', 'status'])
export class AlumniTicket {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'alumni_profile_id', type: 'uuid' }) alumniProfileId: string;
  @Column({ type: 'enum', enum: AlumniTicketCategory, default: AlumniTicketCategory.GENERAL }) category: AlumniTicketCategory;
  @Column({ length: 200 }) subject: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'enum', enum: AlumniTicketStatus, default: AlumniTicketStatus.OPEN }) status: AlumniTicketStatus;
  @Column({ name: 'assigned_to_user_id', nullable: true }) assignedToUserId: string | null;
  @Column({ type: 'text', nullable: true }) resolution: string | null;
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true }) resolvedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
