import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('co_activity_types')
@Index(['tenantId', 'code'], { unique: true })
export class ActivityType {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column({ length: 200 }) name: string;
  /** Unit of measure for the activity quantity, e.g. HOURS, CYCLES, KG */
  @Column({ length: 30, default: 'HOURS' }) unit: string;
  /** The cost center that produces / "sells" this activity */
  @Column({ name: 'cost_center_id', type: 'uuid', nullable: true }) costCenterId: string | null;
  /** GL account to debit on the receiving object (WIP / production order) */
  @Column({ name: 'wip_account_id', type: 'uuid', nullable: true }) wipAccountId: string | null;
  /** GL account to credit (cost center output / activity clearing) */
  @Column({ name: 'credit_account_id', type: 'uuid', nullable: true }) creditAccountId: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
