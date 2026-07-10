import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum TalentPoolType {
  HIPO = 'HIPO',                 // high-potential talent
  SUCCESSOR = 'SUCCESSOR',       // bench for critical roles
  KEY_TALENT = 'KEY_TALENT',     // retention-critical individuals
  EMERGING = 'EMERGING',         // early-career / future leaders
  CRITICAL_ROLE = 'CRITICAL_ROLE',
}

/**
 * A named collection of people managed as a group for development, succession,
 * or retention. Members are nominated in and can be promoted/exited over time.
 */
@Entity('tal_talent_pools')
@Index(['tenantId', 'type'])
export class TalentPool {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'enum', enum: TalentPoolType, default: TalentPoolType.HIPO }) type: TalentPoolType;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'owner_user_id', nullable: true }) ownerUserId: string | null;
  // Target bench size for coverage reporting (successor/critical-role pools).
  @Column({ name: 'target_size', type: 'int', nullable: true }) targetSize: number | null;
  // Inclusion criteria, e.g. [{ criterion:'Potential = High' }].
  @Column({ type: 'jsonb', default: () => "'[]'" }) criteria: Array<{ criterion: string }>;
  @Column({ default: true }) active: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum PoolMemberStatus {
  NOMINATED = 'NOMINATED',
  ACTIVE = 'ACTIVE',
  EXITED = 'EXITED',
}

/**
 * Membership of an employee in a talent pool, with a readiness horizon used for
 * bench-strength reporting.
 */
@Entity('tal_talent_pool_members')
@Index(['tenantId', 'poolId'])
@Index(['tenantId', 'employeeId'])
export class TalentPoolMember {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'pool_id', type: 'uuid' }) poolId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'employee_name', length: 200 }) employeeName: string;
  @Column({ type: 'enum', enum: PoolMemberStatus, default: PoolMemberStatus.NOMINATED }) status: PoolMemberStatus;
  // Readiness horizon for successor pools: READY_NOW | READY_1_2Y | READY_3_5Y | EMERGENCY.
  @Column({ length: 20, nullable: true }) readiness: string | null;
  @Column({ name: 'nominated_by_user_id', nullable: true }) nominatedByUserId: string | null;
  @Column({ type: 'text', nullable: true }) rationale: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
