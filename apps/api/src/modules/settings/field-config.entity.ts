import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('field_configs')
@Index(['tenantId', 'module', 'field'], { unique: true })
export class FieldConfig {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 100 }) module: string;
  @Column({ length: 100 }) field: string;
  @Column({ default: true }) enabled: boolean;
  @Column({ default: false }) required: boolean;
  @Column({ name: 'custom_label', length: 200, nullable: true }) customLabel: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
