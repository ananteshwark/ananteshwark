import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A saved report view: a named set of filters + sort for one catalog
 * report. Private to its creator unless shared with the tenant.
 */
@Entity('rpt_views')
@Index(['tenantId', 'reportCode'])
export class ReportView {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'report_code', length: 60 })
  reportCode: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  filters: Array<{ field: string; op: string; value?: any }>;

  @Column({ name: 'sort_by', nullable: true })
  sortBy: string | null;

  @Column({ name: 'sort_dir', length: 4, default: 'DESC' })
  sortDir: string;

  @Column({ default: false })
  shared: boolean;

  @Column({ name: 'created_by_user_id' })
  createdByUserId: string;

  @CreateDateColumn()
  createdAt: Date;
}
