import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum DocType {
  OFFER_LETTER = 'OFFER_LETTER',
  JOINING_LETTER = 'JOINING_LETTER',
  PAN_CARD = 'PAN_CARD',
  AADHAAR = 'AADHAAR',
  PASSPORT = 'PASSPORT',
  VISA = 'VISA',
  EDUCATION_CERT = 'EDUCATION_CERT',
  EXPERIENCE_LETTER = 'EXPERIENCE_LETTER',
  OTHER = 'OTHER',
}

@Entity('hr_employee_documents')
export class EmployeeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'doc_type', type: 'enum', enum: DocType })
  docType: DocType;

  @Column({ name: 'file_name', length: 255 })
  fileName: string;

  @Column({ name: 'file_url', length: 1000 })
  fileUrl: string;

  @Column({ name: 'uploaded_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  uploadedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
