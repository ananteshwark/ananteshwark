import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * A face-recognition enrolment. Only an opaque template reference is stored —
 * the biometric template itself lives with the matching provider, never in
 * this database.
 */
@Entity('dv_face_enrollments')
@Index(['tenantId', 'employeeId'], { unique: true })
export class FaceEnrollment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'template_ref', length: 200 }) templateRef: string;
  @Column({ default: true }) active: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

/** Per-tenant native-mobile-shell configuration fetched on app launch. */
@Entity('dv_mobile_configs')
@Index(['tenantId'], { unique: true })
export class MobileAppConfig {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'min_version', length: 20, default: '1.0.0' }) minVersion: string;
  @Column({ name: 'latest_version', length: 20, default: '1.0.0' }) latestVersion: string;
  @Column({ type: 'jsonb', default: () => "'{}'" }) theme: Record<string, any>;
  @Column({ name: 'feature_flags', type: 'jsonb', default: () => "'{}'" }) featureFlags: Record<string, boolean>;
  @Column({ name: 'offline_entities', type: 'jsonb', default: () => "'[]'" }) offlineEntities: string[];
  @Column({ name: 'deep_links', type: 'jsonb', default: () => "'[]'" }) deepLinks: Array<{ route: string; pattern: string }>;
  @Column({ name: 'updated_by_user_id', nullable: true }) updatedByUserId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum VisitorStatus {
  PRE_REGISTERED = 'PRE_REGISTERED',
  CHECKED_IN = 'CHECKED_IN',
  CHECKED_OUT = 'CHECKED_OUT',
  NO_SHOW = 'NO_SHOW',
}

/** A visitor managed through the reception kiosk. */
@Entity('dv_visitors')
@Index(['tenantId', 'status'])
export class Visitor {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'full_name', length: 200 }) fullName: string;
  @Column({ length: 200, nullable: true }) company: string | null;
  @Column({ length: 200, nullable: true }) email: string | null;
  @Column({ length: 40, nullable: true }) phone: string | null;
  @Column({ name: 'host_employee_id', type: 'uuid', nullable: true }) hostEmployeeId: string | null;
  @Column({ type: 'text', nullable: true }) purpose: string | null;
  @Column({ name: 'expected_at', type: 'timestamptz', nullable: true }) expectedAt: Date | null;
  @Column({ type: 'enum', enum: VisitorStatus, default: VisitorStatus.PRE_REGISTERED }) status: VisitorStatus;
  @Column({ name: 'badge_number', length: 40, nullable: true }) badgeNumber: string | null;
  @Column({ name: 'checked_in_at', type: 'timestamptz', nullable: true }) checkedInAt: Date | null;
  @Column({ name: 'checked_out_at', type: 'timestamptz', nullable: true }) checkedOutAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
