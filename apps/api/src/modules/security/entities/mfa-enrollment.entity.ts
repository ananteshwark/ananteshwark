import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum MfaMethod {
  TOTP = 'TOTP',
  SMS = 'SMS',
}

/**
 * Ph-273 — A user's MFA enrollment (TOTP secret or SMS number).
 */
@Entity('sec_mfa_enrollments')
@Index(['tenantId', 'userId'], { unique: true })
export class MfaEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'user_id', type: 'varchar' })
  userId: string;

  @Column({ type: 'enum', enum: MfaMethod, default: MfaMethod.TOTP })
  method: MfaMethod;

  @Column({ name: 'totp_secret', length: 64, nullable: true })
  totpSecret: string | null;

  @Column({ name: 'phone_last4', length: 4, nullable: true })
  phoneLast4: string | null;

  @Column({ default: false })
  verified: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
