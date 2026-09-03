import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum RecognitionMethod {
  POINT_IN_TIME = 'POINT_IN_TIME', // recognised in full when control transfers
  OVER_TIME = 'OVER_TIME', // recognised straight-line across the service period
}

export enum ObligationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  FULFILLED = 'FULFILLED',
}

/**
 * A distinct performance obligation within a revenue contract. Its allocated
 * amount is derived from the contract's transaction price in proportion to the
 * obligation's standalone selling price (SSP).
 */
@Entity('fin_rev_obligations')
@Index(['tenantId', 'contractId'])
export class PerformanceObligation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Standalone selling price — basis for relative allocation. */
  @Column({
    name: 'standalone_selling_price',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  standaloneSellingPrice: number;

  /** Portion of the contract transaction price allocated to this obligation. */
  @Column({
    name: 'allocated_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  allocatedAmount: number;

  @Column({
    name: 'recognized_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  recognizedAmount: number;

  @Column({ type: 'enum', enum: RecognitionMethod })
  method: RecognitionMethod;

  /** OVER_TIME: service start. POINT_IN_TIME: ignored. */
  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  /** OVER_TIME: service end (inclusive month). POINT_IN_TIME: ignored. */
  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  /** POINT_IN_TIME: date control transferred (set on fulfilment). */
  @Column({ name: 'fulfilled_date', type: 'date', nullable: true })
  fulfilledDate: string | null;

  @Column({ type: 'enum', enum: ObligationStatus, default: ObligationStatus.PENDING })
  status: ObligationStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
