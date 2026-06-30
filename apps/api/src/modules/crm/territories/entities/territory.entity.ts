import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-217 — A sales territory with coverage rules (regions, industries, named
 * accounts). An account matches a territory when it falls in any coverage set.
 */
@Entity('crm_territories')
@Index(['tenantId', 'code'], { unique: true })
export class Territory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'owner_id', type: 'varchar', nullable: true })
  ownerId: string | null;

  @Column({ type: 'jsonb', default: [] })
  regions: string[];

  @Column({ type: 'jsonb', default: [] })
  industries: string[];

  @Column({ name: 'account_ids', type: 'jsonb', default: [] })
  accountIds: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
