import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('fin_cost_centers')
@Index(['code', 'tenantId'], { unique: true })
export class CostCenter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // Phase 25 — CO-CCA enrichments
  @Column({ name: 'responsible_person_id', type: 'uuid', nullable: true })
  responsiblePersonId: string | null;

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom: string | null;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo: string | null;

  @Column({
    name: 'budget_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  budgetAmount: number | null;

  /** Tree path, e.g. "CORP/IT/DEV" */
  @Column({ name: 'hierarchy_node', nullable: true })
  hierarchyNode: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
