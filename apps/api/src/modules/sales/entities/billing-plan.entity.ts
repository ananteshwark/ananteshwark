import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum BillingPlanType {
  MILESTONE = 'MILESTONE',
  PERIODIC = 'PERIODIC',
  PARTIAL = 'PARTIAL',
}

export enum BillingMilestoneStatus {
  PENDING = 'PENDING',
  BILLED = 'BILLED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

@Entity('sd_billing_plans')
@Index(['tenantId', 'salesOrderId'])
export class BillingPlan {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'sales_order_id', type: 'uuid' }) salesOrderId: string;
  @Column({ name: 'order_total', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) orderTotal: number;
  @Column({ name: 'plan_type', type: 'enum', enum: BillingPlanType, default: BillingPlanType.MILESTONE }) planType: BillingPlanType;
  @Column({ type: 'jsonb', default: [] }) milestones: Array<{
    milestoneNumber: number;
    description: string;
    billingDate: string;
    percentage: number;
    amount: number;
    status: string;
    invoiceId?: string;
  }>;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
