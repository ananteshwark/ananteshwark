import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('platform_custom_field_values')
@Index(['tenantId', 'entityType', 'entityId', 'fieldDefinitionId'], { unique: true })
export class CustomFieldValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'entity_type', length: 100 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ name: 'field_definition_id', type: 'uuid' })
  @Index()
  fieldDefinitionId: string;

  // All values stored as text; service casts to the correct type on read
  @Column({ type: 'text', nullable: true })
  value: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
