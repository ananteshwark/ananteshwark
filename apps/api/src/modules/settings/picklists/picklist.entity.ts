import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

/**
 * A Picklist is a named, tenant-scoped set of dropdown options belonging to a
 * module (e.g. hr / employmentType, finance / paymentTerms). Modules resolve
 * their dropdown values by (module, key) so options are centrally managed here.
 */
@Entity('picklists')
@Index(['tenantId', 'module', 'key'], { unique: true })
export class Picklist {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 100 }) module: string;
  @Column({ length: 120 }) key: string;
  @Column({ length: 200 }) label: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  /** true for seeded system picklists; blocks deletion but options stay editable. */
  @Column({ name: 'is_system', default: false }) isSystem: boolean;
  @OneToMany(() => PicklistOption, (o) => o.picklist, { cascade: true, eager: true })
  options: PicklistOption[];
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('picklist_options')
@Index(['tenantId', 'picklistId'])
export class PicklistOption {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'picklist_id' }) picklistId: string;
  @ManyToOne(() => Picklist, (p) => p.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'picklist_id' })
  picklist: Picklist;
  @Column({ length: 200 }) value: string;
  @Column({ length: 200 }) label: string;
  @Column({ name: 'sort_order', default: 0 }) sortOrder: number;
  @Column({ default: true }) active: boolean;
  @Column({ length: 20, nullable: true }) color: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
