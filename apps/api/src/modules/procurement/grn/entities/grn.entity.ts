import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum GrnStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

@Entity('proc_grns')
@Index(['grnNumber', 'tenantId'], { unique: true })
export class Grn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'grn_number', length: 50 })
  grnNumber: string;

  @Column({ name: 'po_id', type: 'uuid' })
  poId: string;

  @Column({ name: 'vendor_id', type: 'varchar' })
  vendorId: string;

  @Column({ name: 'receipt_date', type: 'date' })
  receiptDate: string;

  @Column({ type: 'enum', enum: GrnStatus, default: GrnStatus.DRAFT })
  status: GrnStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
