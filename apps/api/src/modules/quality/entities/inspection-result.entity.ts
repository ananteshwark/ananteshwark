import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ResultVerdict {
  PASS = 'PASS',
  FAIL = 'FAIL',
}

@Entity('qm_inspection_results')
@Index(['tenantId', 'inspectionLotId'])
@Index(['tenantId', 'inspectionLotId', 'characteristicId'], { unique: true })
export class InspectionResult {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'inspection_lot_id', type: 'uuid' }) inspectionLotId: string;
  @Column({ name: 'characteristic_id', type: 'uuid' }) characteristicId: string;
  @Column({ name: 'characteristic_name' }) characteristicName: string;
  @Column({ name: 'measured_value', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer }) measuredValue: number | null;
  @Column({ name: 'qualitative_value', nullable: true }) qualitativeValue: string | null;
  @Column({ type: 'enum', enum: ResultVerdict }) verdict: ResultVerdict;
  @Column({ name: 'recorded_by', type: 'uuid', nullable: true }) recordedBy: string | null;
  @Column({ name: 'recorded_at', type: 'timestamptz', nullable: true }) recordedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
