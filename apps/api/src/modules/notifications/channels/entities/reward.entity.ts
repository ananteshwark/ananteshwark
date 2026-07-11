import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/** A redeemable item in the reward store, priced in recognition points. */
@Entity('nt_reward_items')
@Index(['tenantId', 'active'])
export class RewardCatalogItem {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ length: 80, nullable: true }) category: string | null;
  @Column({ name: 'points_cost', type: 'int' }) pointsCost: number;
  // null stock = unlimited.
  @Column({ type: 'int', nullable: true }) stock: number | null;
  @Column({ default: true }) active: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum RedemptionStatus {
  REQUESTED = 'REQUESTED',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

@Entity('nt_reward_redemptions')
@Index(['tenantId', 'userId'])
@Index(['tenantId', 'status'])
export class RewardRedemption {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'user_id' }) userId: string;
  @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
  @Column({ name: 'item_name', length: 200 }) itemName: string;
  @Column({ name: 'points_spent', type: 'int' }) pointsSpent: number;
  @Column({ type: 'enum', enum: RedemptionStatus, default: RedemptionStatus.REQUESTED }) status: RedemptionStatus;
  @Column({ name: 'fulfillment_ref', length: 200, nullable: true }) fulfillmentRef: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
