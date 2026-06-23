import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum OutlineAgreementType {
  VALUE_CONTRACT = 'VALUE_CONTRACT',
  QUANTITY_CONTRACT = 'QUANTITY_CONTRACT',
}

export enum OutlineAgreementStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CLOSED = 'CLOSED',
}

@Entity('proc_outline_agreements')
@Index(['agreementNumber', 'tenantId'], { unique: true })
export class OutlineAgreement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'agreement_number', length: 50 })
  agreementNumber: string;

  @Column({ name: 'vendor_id', type: 'varchar' })
  vendorId: string;

  @Column({ name: 'vendor_name', length: 200, nullable: true })
  vendorName: string | null;

  @Column({ type: 'enum', enum: OutlineAgreementType })
  type: OutlineAgreementType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'target_value',
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  targetValue: number | null;

  @Column({
    name: 'target_quantity',
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  targetQuantity: number | null;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @Column({ name: 'item_description', length: 300, nullable: true })
  itemDescription: string | null;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom: string;

  @Column({ name: 'valid_to', type: 'date' })
  validTo: string;

  @Column({ type: 'enum', enum: OutlineAgreementStatus, default: OutlineAgreementStatus.DRAFT })
  status: OutlineAgreementStatus;

  @Column({
    name: 'released_value',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  releasedValue: number;

  @Column({
    name: 'released_quantity',
    type: 'numeric',
    precision: 18,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  releasedQuantity: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
