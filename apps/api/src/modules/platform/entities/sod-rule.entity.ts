import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum SodRiskLevel {
  LOW    = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH   = 'HIGH',
}

@Entity('plt_sod_rules')
@Index(['tenantId', 'code'], { unique: true })
export class SodRule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column() name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'permission_a' }) permissionA: string;
  @Column({ name: 'permission_b' }) permissionB: string;
  @Column({ name: 'risk_level', type: 'enum', enum: SodRiskLevel }) riskLevel: SodRiskLevel;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
