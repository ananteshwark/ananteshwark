import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export interface CustomFieldDef {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  required?: boolean;
}

/**
 * Ph-289/290 — A tenant-defined custom business object: its field schema plus
 * UI metadata (list-view columns, sidebar label) for the page builder.
 */
@Entity('platform_custom_objects')
@Index(['tenantId', 'apiName'], { unique: true })
export class CustomObject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'api_name', length: 60 })
  apiName: string;

  @Column({ type: 'jsonb', default: [] })
  fields: CustomFieldDef[];

  @Column({ name: 'list_view_columns', type: 'jsonb', default: [] })
  listViewColumns: string[];

  @Column({ name: 'sidebar_label', length: 100, nullable: true })
  sidebarLabel: string | null;

  @Column({ length: 40, nullable: true })
  icon: string | null;

  @Column({ name: 'source_pack', length: 60, nullable: true })
  sourcePack: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
