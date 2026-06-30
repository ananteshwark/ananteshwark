import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-204 — A supplier compliance/quality certificate (ISO, etc.) with expiry.
 */
@Entity('proc_supplier_certificates')
@Index(['tenantId', 'supplierId'])
export class SupplierCertificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'supplier_id', type: 'varchar' })
  supplierId: string;

  @Column({ name: 'cert_type', length: 80 })
  certType: string; // e.g. ISO 9001

  @Column({ name: 'cert_number', length: 100, nullable: true })
  certNumber: string | null;

  @Column({ length: 150, nullable: true })
  issuer: string | null;

  @Column({ name: 'issue_date', type: 'date', nullable: true })
  issueDate: string | null;

  @Column({ name: 'expiry_date', type: 'date' })
  expiryDate: string;

  @Column({ name: 'document_url', length: 500, nullable: true })
  documentUrl: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
