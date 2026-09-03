import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('fin_consolidation_groups')
@Index(['code', 'tenantId'], { unique: true })
export class ConsolidationGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ length: 10, default: 'USD', name: 'reporting_currency' })
  reportingCurrency: string;

  // JSON array of entity IDs that belong to this consolidation group
  @Column({ name: 'member_entity_ids', type: 'json', default: '[]' })
  memberEntityIds: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
