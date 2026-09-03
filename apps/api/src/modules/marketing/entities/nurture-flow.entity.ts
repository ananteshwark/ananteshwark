import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export interface NurtureStep {
  order: number;
  delayDays: number;
  action: string;       // e.g. SEND_EMAIL, SEND_SMS, NOTIFY_SALES
  templateRef?: string;
}

/**
 * Ph-235 — An automated nurture sequence triggered by a lead behavior.
 */
@Entity('mkt_nurture_flows')
@Index(['tenantId', 'triggerBehavior'])
export class NurtureFlow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'trigger_behavior', length: 60 })
  triggerBehavior: string;

  @Column({ type: 'jsonb', default: [] })
  steps: NurtureStep[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
