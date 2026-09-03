import { Entity, PrimaryGeneratedColumn, Column, Index, UpdateDateColumn } from 'typeorm';

/**
 * A per-tenant, per-key monotonic counter used to hand out gap-free document
 * numbers without the read-then-write race of `count()+1`. The `next_value` is
 * incremented atomically via an INSERT ... ON CONFLICT DO UPDATE ... RETURNING.
 */
@Entity('document_sequences')
@Index(['tenantId', 'key'], { unique: true })
export class DocumentSequence {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 120 }) key: string;
  @Column({ name: 'next_value', type: 'bigint', default: 0 }) nextValue: string;
  @UpdateDateColumn() updatedAt: Date;
}
