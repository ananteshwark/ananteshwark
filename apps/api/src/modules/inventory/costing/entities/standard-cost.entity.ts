import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-138 — Standard cost per item (optionally per org), effective-dated.
 * The active standard is the most recent effective record on a given date.
 */
@Entity('inv_standard_costs')
@Index(['tenantId', 'itemId', 'organizationId', 'effectiveFrom'])
export class StandardCost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string | null;

  @Column({ name: 'standard_cost', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  standardCost: number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
