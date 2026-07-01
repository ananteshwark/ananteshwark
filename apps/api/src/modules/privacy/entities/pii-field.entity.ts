import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum MaskStrategy {
  FULL = 'FULL',       // ***
  PARTIAL = 'PARTIAL', // keep last 4
  EMAIL = 'EMAIL',     // a***@domain
  HASH = 'HASH',
}

/**
 * Ph-269 — A registered PII field in the personal-data inventory.
 */
@Entity('privacy_pii_fields')
@Index(['tenantId', 'entityName', 'fieldName'], { unique: true })
export class PiiField {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'entity_name', length: 80 })
  entityName: string;

  @Column({ name: 'field_name', length: 80 })
  fieldName: string;

  @Column({ length: 40 })
  category: string; // NAME / EMAIL / PHONE / GOV_ID / FINANCIAL / HEALTH

  @Column({ length: 20, default: 'MEDIUM' })
  sensitivity: string; // LOW / MEDIUM / HIGH

  @Column({ name: 'mask_strategy', type: 'enum', enum: MaskStrategy, default: MaskStrategy.FULL })
  maskStrategy: MaskStrategy;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
