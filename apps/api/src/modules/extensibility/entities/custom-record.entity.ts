import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-289 — A dynamic record stored against a custom object.
 */
@Entity('platform_custom_records')
@Index(['tenantId', 'objectId'])
export class CustomRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'object_id', type: 'uuid' })
  objectId: string;

  @Column({ type: 'jsonb', default: {} })
  data: Record<string, any>;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
