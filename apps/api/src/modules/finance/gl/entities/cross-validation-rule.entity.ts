import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SegmentOperator {
  EQ = 'eq',
  IN = 'in',
  RANGE = 'range',
  STARTS_WITH = 'startsWith',
}

/**
 * Ph-98 — Cross-validation rule.
 * Oracle equivalent: GL Cross-Validation Rules that forbid invalid segment
 * combinations at journal entry time.
 *
 * Reads as: "When the condition segment matches, the target segment must NOT
 * match (DISALLOW) — otherwise the combination is rejected."
 *
 * Example: condition COMPANY eq "01" AND target ACCOUNT range "9000".."9999"
 *          → DISALLOW (company 01 may not use 9xxx accounts).
 */
@Entity('fin_gl_cross_validation_rules')
@Index(['tenantId', 'isActive'])
export class CrossValidationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Condition leg
  @Column({ name: 'condition_position', type: 'int' })
  conditionPosition: number;

  @Column({ name: 'condition_operator', type: 'enum', enum: SegmentOperator })
  conditionOperator: SegmentOperator;

  @Column({ name: 'condition_value', type: 'jsonb' })
  conditionValue: any; // string | string[] | {from,to}

  // Target leg (the segment that gets disallowed when the condition matches)
  @Column({ name: 'target_position', type: 'int' })
  targetPosition: number;

  @Column({ name: 'target_operator', type: 'enum', enum: SegmentOperator })
  targetOperator: SegmentOperator;

  @Column({ name: 'target_value', type: 'jsonb' })
  targetValue: any;

  @Column({ name: 'error_message', length: 255, nullable: true })
  errorMessage: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
