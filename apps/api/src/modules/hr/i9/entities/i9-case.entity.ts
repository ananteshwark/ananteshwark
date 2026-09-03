import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum I9Status {
  SECTION1_PENDING = 'SECTION1_PENDING', // employee attestation outstanding
  SECTION2_PENDING = 'SECTION2_PENDING', // employer document verification outstanding
  EVERIFY_PENDING = 'EVERIFY_PENDING',   // awaiting E-Verify result
  COMPLETE = 'COMPLETE',
  REVERIFICATION = 'REVERIFICATION',     // work authorization expiring/expired
}

export enum CitizenshipStatus {
  US_CITIZEN = 'US_CITIZEN',
  NONCITIZEN_NATIONAL = 'NONCITIZEN_NATIONAL',
  LAWFUL_PERMANENT_RESIDENT = 'LAWFUL_PERMANENT_RESIDENT',
  ALIEN_AUTHORIZED = 'ALIEN_AUTHORIZED',
}

export enum EVerifyResult {
  EMPLOYMENT_AUTHORIZED = 'EMPLOYMENT_AUTHORIZED',
  TENTATIVE_NONCONFIRMATION = 'TENTATIVE_NONCONFIRMATION',
  FINAL_NONCONFIRMATION = 'FINAL_NONCONFIRMATION',
}

/**
 * A Form I-9 (Employment Eligibility Verification) case with optional E-Verify.
 * Section 1 is the employee attestation; Section 2 is the employer's review of
 * identity/work-authorization documents (List A alone, or List B + List C).
 */
@Entity('hr_i9_cases')
@Index(['tenantId', 'employeeId'], { unique: true })
@Index(['tenantId', 'status'])
export class I9Case {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'employee_name', length: 200 }) employeeName: string;
  @Column({ name: 'hire_date', type: 'date' }) hireDate: string;
  // Section 2 must be completed within 3 business days of hire.
  @Column({ name: 'section2_due_date', type: 'date' }) section2DueDate: string;
  @Column({ type: 'enum', enum: I9Status, default: I9Status.SECTION1_PENDING }) status: I9Status;
  @Column({ name: 'everify_enabled', default: false }) everifyEnabled: boolean;

  // Section 1 — employee attestation.
  @Column({ name: 'section1', type: 'jsonb', nullable: true })
  section1: { citizenshipStatus: CitizenshipStatus; workAuthExpiry?: string | null; signedAt: string } | null;

  // Section 2 — employer document review.
  @Column({ name: 'section2', type: 'jsonb', nullable: true })
  section2: { documents: Array<{ list: 'A' | 'B' | 'C'; title: string; number?: string; expiry?: string }>; verifiedByUserId: string; verifiedAt: string } | null;

  // E-Verify result (if enabled).
  @Column({ name: 'everify', type: 'jsonb', nullable: true })
  everify: { caseNumber: string; result: EVerifyResult; submittedAt: string } | null;

  @Column({ name: 'reverification_date', type: 'date', nullable: true }) reverificationDate: string | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
