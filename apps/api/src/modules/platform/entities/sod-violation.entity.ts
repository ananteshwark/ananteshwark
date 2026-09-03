import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum ViolationStatus {
  OPEN      = 'OPEN',
  MITIGATED = 'MITIGATED',
  ACCEPTED  = 'ACCEPTED',
}

@Entity('plt_sod_violations')
@Index(['tenantId', 'userId', 'ruleId'])
export class SodViolation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'rule_id', type: 'uuid' }) ruleId: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Column({ type: 'enum', enum: ViolationStatus, default: ViolationStatus.OPEN }) status: ViolationStatus;
  @Column({ name: 'detected_at', type: 'timestamptz', default: () => 'NOW()' }) detectedAt: Date;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
}
