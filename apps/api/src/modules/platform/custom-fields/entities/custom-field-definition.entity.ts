import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CustomFieldType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  DROPDOWN = 'DROPDOWN',
  CHECKBOX = 'CHECKBOX',
  MULTI_SELECT = 'MULTI_SELECT',
}

export enum CustomFieldEntityType {
  EMPLOYEE = 'EMPLOYEE',
  VENDOR = 'VENDOR',
  CUSTOMER = 'CUSTOMER',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  VENDOR_INVOICE = 'VENDOR_INVOICE',
  SALES_ORDER = 'SALES_ORDER',
  ASSET = 'ASSET',
  PROJECT = 'PROJECT',
}

@Entity('platform_custom_field_definitions')
@Index(['tenantId', 'entityType', 'fieldKey'], { unique: true })
export class CustomFieldDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({
    name: 'entity_type',
    type: 'enum',
    enum: CustomFieldEntityType,
  })
  entityType: CustomFieldEntityType;

  @Column({ name: 'field_key', length: 100 })
  fieldKey: string;

  @Column({ name: 'field_label', length: 200 })
  fieldLabel: string;

  @Column({
    name: 'field_type',
    type: 'enum',
    enum: CustomFieldType,
  })
  fieldType: CustomFieldType;

  @Column({ name: 'is_required', default: false })
  isRequired: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'show_in_list', default: false })
  showInList: boolean;

  // For DROPDOWN and MULTI_SELECT: array of allowed options
  @Column({ type: 'json', nullable: true })
  options: string[] | null;

  @Column({ name: 'default_value', type: 'text', nullable: true })
  defaultValue: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
