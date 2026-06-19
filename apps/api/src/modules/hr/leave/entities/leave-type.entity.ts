import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum AccrualType {
  MANUAL = 'MANUAL',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
  PER_LEAVE_YEAR = 'PER_LEAVE_YEAR',
}

@Entity('hr_leave_types')
@Index(['code', 'tenantId'], { unique: true })
export class LeaveType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'accrual_type', type: 'enum', enum: AccrualType, default: AccrualType.MANUAL })
  accrualType: AccrualType;

  @Column({ name: 'accrual_rate', type: 'decimal', precision: 10, scale: 2, default: 0 })
  accrualRate: number;

  @Column({ name: 'max_balance', type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxBalance: number | null;

  @Column({ name: 'max_carry_forward', type: 'decimal', precision: 10, scale: 2, default: 0 })
  maxCarryForward: number;

  @Column({ name: 'is_paid', default: true })
  isPaid: boolean;

  @Column({ name: 'is_encashable', default: false })
  isEncashable: boolean;

  @Column({ name: 'applicable_gender', length: 20, nullable: true })
  applicableGender: string | null;

  @Column({ name: 'min_notice_days', type: 'int', default: 0 })
  minNoticeDays: number;

  @Column({ name: 'max_consecutive_days', type: 'int', nullable: true })
  maxConsecutiveDays: number | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
