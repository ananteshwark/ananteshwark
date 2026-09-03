import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum EnrollmentStatus {
  PENDING    = 'PENDING',
  ACTIVE     = 'ACTIVE',
  WAIVED     = 'WAIVED',
  TERMINATED = 'TERMINATED',
}

@Entity('ben_enrollments')
@Index(['tenantId', 'employeeId', 'planId'], { unique: true })
export class BenefitEnrollment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'plan_id', type: 'uuid' }) planId: string;
  @Column({ type: 'enum', enum: EnrollmentStatus, default: EnrollmentStatus.PENDING }) status: EnrollmentStatus;
  @Column({ name: 'enrollment_date', type: 'date' }) enrollmentDate: string;
  @Column({ name: 'termination_date', type: 'date', nullable: true }) terminationDate: string | null;
  @Column({ type: 'jsonb', nullable: true }) dependents: Array<{ name: string; relationship: string; dob?: string }> | null;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
