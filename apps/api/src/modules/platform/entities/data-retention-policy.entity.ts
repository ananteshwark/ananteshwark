import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum RetentionAction {
  ARCHIVE = 'ARCHIVE',
  DELETE  = 'DELETE',
  ANONYMIZE = 'ANONYMIZE',
}

@Entity('plt_data_retention_policies')
@Index(['tenantId', 'entityName'], { unique: true })
export class DataRetentionPolicy {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'entity_name' }) entityName: string;
  @Column({ name: 'retention_days', type: 'int' }) retentionDays: number;
  @Column({ name: 'action', type: 'enum', enum: RetentionAction }) action: RetentionAction;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
}
