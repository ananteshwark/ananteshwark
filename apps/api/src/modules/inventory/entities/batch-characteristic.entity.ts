import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum CharacteristicResult {
  PENDING = 'PENDING',
  PASS = 'PASS',
  FAIL = 'FAIL',
}

@Entity('inv_batch_characteristics')
@Index(['tenantId', 'lotSerialId'])
export class BatchCharacteristic {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'lot_serial_id', type: 'uuid' }) lotSerialId: string;
  @Column({ length: 100 }) name: string;
  @Column({ type: 'text', nullable: true }) value: string | null;
  @Column({ length: 50, nullable: true }) unit: string | null;
  @Column({ name: 'min_value', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer }) minValue: number | null;
  @Column({ name: 'max_value', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer }) maxValue: number | null;
  @Column({ type: 'enum', enum: CharacteristicResult, default: CharacteristicResult.PENDING }) result: CharacteristicResult;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ name: 'tested_at', type: 'timestamp', nullable: true }) testedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
