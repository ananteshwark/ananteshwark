import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum CharacteristicType {
  MEASURED    = 'MEASURED',
  QUALITATIVE = 'QUALITATIVE',
}

@Entity('qm_characteristics')
@Index(['tenantId', 'inspectionPlanId'])
export class QualityCharacteristic {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'inspection_plan_id', type: 'uuid' }) inspectionPlanId: string;
  @Column({ length: 50 }) code: string;
  @Column() name: string;
  @Column({ type: 'enum', enum: CharacteristicType, default: CharacteristicType.MEASURED }) type: CharacteristicType;
  @Column({ nullable: true }) uom: string | null;
  @Column({ name: 'lower_limit', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer }) lowerLimit: number | null;
  @Column({ name: 'upper_limit', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer }) upperLimit: number | null;
  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer }) target: number | null;
  @Column({ default: true }) mandatory: boolean;
  @Column({ type: 'int', default: 0 }) sequence: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
