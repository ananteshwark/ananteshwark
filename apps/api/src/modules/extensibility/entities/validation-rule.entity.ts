import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-291 — A tenant-defined validation rule on a custom object. The condition
 * describes an INVALID state; if it matches a record, the errorMessage fires.
 */
@Entity('platform_validation_rules')
@Index(['tenantId', 'objectId'])
export class ValidationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'object_id', type: 'uuid' })
  objectId: string;

  @Column({ length: 120 })
  name: string;

  /** { field, op, value } — the invalid condition. */
  @Column({ type: 'jsonb' })
  condition: { field: string; op: string; value: any };

  @Column({ name: 'error_message', length: 300 })
  errorMessage: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
