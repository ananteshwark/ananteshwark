import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ContractType {
  PURCHASE = 'PURCHASE',
  SALES    = 'SALES',
  SERVICE  = 'SERVICE',
  LEASE    = 'LEASE',
  OTHER    = 'OTHER',
}

export enum ContractStatus {
  DRAFT     = 'DRAFT',
  ACTIVE    = 'ACTIVE',
  EXPIRED   = 'EXPIRED',
  TERMINATED = 'TERMINATED',
  RENEWED   = 'RENEWED',
}

export enum RenewalType {
  MANUAL = 'MANUAL',
  AUTO   = 'AUTO',
}

@Entity('clm_contracts')
@Index(['tenantId', 'contractNumber'], { unique: true })
export class Contract {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'contract_number', length: 50 }) contractNumber: string;
  @Column() title: string;
  @Column({ type: 'enum', enum: ContractType }) type: ContractType;
  @Column({ type: 'enum', enum: ContractStatus, default: ContractStatus.DRAFT }) status: ContractStatus;

  @Column({ name: 'counterparty_id', type: 'uuid', nullable: true }) counterpartyId: string | null;
  @Column({ name: 'counterparty_name', length: 200, nullable: true }) counterpartyName: string | null;

  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ name: 'end_date', type: 'date', nullable: true }) endDate: string | null;
  @Column({ name: 'signed_date', type: 'date', nullable: true }) signedDate: string | null;
  @Column({ name: 'renewal_date', type: 'date', nullable: true }) renewalDate: string | null;
  @Column({ name: 'alert_days_before', type: 'int', default: 30 }) alertDaysBefore: number;
  @Column({ name: 'renewal_type', type: 'enum', enum: RenewalType, default: RenewalType.MANUAL })
  renewalType: RenewalType;

  @Column({ name: 'contract_value', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer })
  contractValue: number | null;
  @Column({ length: 10, default: 'INR' }) currency: string;

  @Column({ name: 'po_id', type: 'uuid', nullable: true }) poId: string | null;
  @Column({ name: 'invoice_id', type: 'uuid', nullable: true }) invoiceId: string | null;
  @Column({ name: 'template_id', type: 'uuid', nullable: true }) templateId: string | null;

  @Column({ type: 'text', nullable: true }) terms: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ name: 'owner_id', type: 'uuid', nullable: true }) ownerId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
