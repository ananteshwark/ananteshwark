import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ExpenseRateType {
  PER_DIEM = 'PER_DIEM', // rate per day, classifier = city class (METRO, TIER1, …)
  MILEAGE = 'MILEAGE',   // rate per km, classifier = vehicle class (CAR, BIKE, …)
}

/**
 * Rate card for computed expense lines. Per-diem and mileage lines reference
 * a rate; the line amount is rate × quantity (days or kilometres).
 */
@Entity('exp_rates')
@Index(['tenantId', 'rateType'])
export class ExpenseRate {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'rate_type', type: 'enum', enum: ExpenseRateType }) rateType: ExpenseRateType;
  @Column({ length: 200 }) name: string;
  // City class for per-diem, vehicle class for mileage.
  @Column({ length: 50 }) classifier: string;
  @Column({ length: 10, default: 'INR' }) currency: string;
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) rate: number;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
