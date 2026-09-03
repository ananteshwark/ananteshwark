import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-272 — A Data Subject Access Request: an export of all personal data held
 * for a subject, with an access audit trail.
 */
@Entity('privacy_dsar_requests')
@Index(['tenantId', 'subjectId'])
export class DsarRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'subject_id', type: 'varchar' })
  subjectId: string;

  @Column({ length: 20, default: 'COMPLETED' })
  status: string;

  @Column({ name: 'exported_data', type: 'jsonb', default: {} })
  exportedData: any;

  @Column({ name: 'requested_by', type: 'varchar' })
  requestedBy: string;

  @Column({ name: 'access_log', type: 'jsonb', default: [] })
  accessLog: Array<{ userId: string; at: string; action: string }>;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
