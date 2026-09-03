import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum TimeRuleType {
  LATE_ARRIVAL = 'LATE_ARRIVAL',
  EARLY_DEPARTURE = 'EARLY_DEPARTURE',
  OVERTIME = 'OVERTIME',
  ABSENCE = 'ABSENCE',
  COMP_OFF = 'COMP_OFF'
}

@Entity('hr_time_eval_rules')
export class TimeEvaluationRule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ type: 'enum', enum: TimeRuleType }) type: TimeRuleType;
  @Column({ name: 'grace_minutes', type: 'int', default: 0 }) graceMinutes: number;
  @Column({ name: 'threshold_minutes', type: 'int', default: 30 }) thresholdMinutes: number;
  @Column({ name: 'overtime_rate', type: 'numeric', precision: 4, scale: 2, default: 1.5, nullable: true }) overtimeRate: number | null;
  @Column({ name: 'comp_off_enabled', default: false }) compOffEnabled: boolean;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
