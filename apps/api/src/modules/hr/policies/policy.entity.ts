import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum PolicyStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * HR policy document with immutable versioning. Editing a PUBLISHED policy
 * mints a new version; acknowledgements are recorded per version so
 * re-published policies require fresh sign-off.
 */
@Entity('hr_policies')
@Index(['tenantId', 'category'])
export class HrPolicy {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) title: string;
  @Column({ length: 100, default: 'general' }) category: string;
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'int', default: 1 }) version: number;
  @Column({ type: 'enum', enum: PolicyStatus, default: PolicyStatus.DRAFT }) status: PolicyStatus;
  // Whether employees must acknowledge this policy.
  @Column({ name: 'requires_ack', default: true }) requiresAck: boolean;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt: Date | null;
  @Column({ name: 'created_by_user_id' }) createdByUserId: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('hr_policy_acknowledgements')
@Index(['tenantId', 'policyId', 'version', 'employeeId'], { unique: true })
export class HrPolicyAcknowledgement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'policy_id', type: 'uuid' }) policyId: string;
  @Column({ type: 'int' }) version: number;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'acknowledged_by_user_id' }) acknowledgedByUserId: string;
  @CreateDateColumn() acknowledgedAt: Date;
}
