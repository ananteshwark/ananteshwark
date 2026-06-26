import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Ph-96 — Chart of Accounts segment definition.
 * Oracle equivalent: GL Key Flexfield segments + Value Sets.
 *
 * An account code such as "01-200-4000-PROD" is decomposed by a delimiter
 * into ordered segments (Company-CostCenter-Account-Product). Each segment
 * here defines one position with its own value set.
 */
@Entity('fin_coa_segments')
@Index(['tenantId', 'position'], { unique: true })
export class CoaSegment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'int' })
  position: number; // 1..6

  @Column({ length: 50 })
  code: string; // e.g. COMPANY, COST_CENTER, ACCOUNT, PRODUCT

  @Column({ length: 100 })
  label: string;

  @Column({ type: 'int', default: 4 })
  length: number; // expected character length of segment value

  @Column({ name: 'is_required', default: true })
  isRequired: boolean;

  @Column({ length: 5, default: '-' })
  delimiter: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * Ph-96 — allowed values for a segment (the "value set").
 * Supports parent-child for hierarchical rollups (Ph-97 trees reference these).
 */
@Entity('fin_coa_segment_values')
@Index(['tenantId', 'segmentId', 'value'], { unique: true })
export class CoaSegmentValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'segment_id', type: 'uuid' })
  segmentId: string;

  @Column({ length: 50 })
  value: string;

  @Column({ length: 200 })
  description: string;

  @Column({ name: 'parent_value', length: 50, nullable: true })
  parentValue: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
