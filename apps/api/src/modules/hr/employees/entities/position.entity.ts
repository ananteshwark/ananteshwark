import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum PositionStatus { OPEN = 'OPEN', FILLED = 'FILLED', FROZEN = 'FROZEN', CLOSED = 'CLOSED' }

@Entity('hr_positions')
@Index(['tenantId', 'positionCode'], { unique: true })
export class Position {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'position_code', length: 50 }) positionCode: string;
  @Column() title: string;
  @Column({ name: 'department_id', type: 'uuid', nullable: true }) departmentId: string | null;
  @Column({ name: 'grade_id', type: 'uuid', nullable: true }) gradeId: string | null;
  @Column({ name: 'designation_id', type: 'uuid', nullable: true }) designationId: string | null;
  @Column({ name: 'budgeted_headcount', type: 'int', default: 1 }) budgetedHeadcount: number;
  @Column({ name: 'filled_headcount', type: 'int', default: 0 }) filledHeadcount: number;
  @Column({ type: 'enum', enum: PositionStatus, default: PositionStatus.OPEN }) status: PositionStatus;
  @Column({ nullable: true }) description: string | null;
  @Column({ name: 'reports_to_position_id', type: 'uuid', nullable: true }) reportsToPositionId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
