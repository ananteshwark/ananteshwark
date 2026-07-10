import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum AttestationMethod {
  SELF = 'SELF',
  MANAGER = 'MANAGER',
  PEER = 'PEER',
  CERTIFICATION = 'CERTIFICATION',
  ASSESSMENT = 'ASSESSMENT',
}

export enum AttestationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

/**
 * Evidence that an employee holds a skill at a claimed proficiency. Verified
 * attestations promote a self-assessed skill to "verified"; certifications can
 * carry an expiry that the sweep flips to EXPIRED.
 */
@Entity('hr_skill_attestations')
@Index(['tenantId', 'employeeId'])
@Index(['tenantId', 'skillId'])
@Index(['tenantId', 'status'])
export class SkillAttestation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'skill_id', type: 'uuid' }) skillId: string;
  @Column({ name: 'proficiency_claimed', type: 'int' }) proficiencyClaimed: number;
  @Column({ type: 'enum', enum: AttestationMethod, default: AttestationMethod.SELF }) method: AttestationMethod;
  @Column({ type: 'enum', enum: AttestationStatus, default: AttestationStatus.PENDING }) status: AttestationStatus;
  @Column({ name: 'attested_by_user_id', nullable: true }) attestedByUserId: string | null;
  @Column({ name: 'verified_by_user_id', nullable: true }) verifiedByUserId: string | null;
  @Column({ name: 'evidence_url', type: 'text', nullable: true }) evidenceUrl: string | null;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt: Date | null;
  @Column({ name: 'expires_at', type: 'date', nullable: true }) expiresAt: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
