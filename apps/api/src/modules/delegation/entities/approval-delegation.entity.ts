import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('approval_delegations')
@Index(['tenantId', 'delegatorUserId', 'isActive'])
@Index(['tenantId', 'delegateeUserId', 'isActive'])
export class ApprovalDelegation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'delegator_user_id' })
  delegatorUserId: string;

  @Column({ name: 'delegatee_user_id' })
  delegateeUserId: string;

  @Column({ name: 'from_date', type: 'date' })
  fromDate: string;

  @Column({ name: 'to_date', type: 'date' })
  toDate: string;

  // Scope of approval authority covered, e.g. ALL/HR/FINANCE/PROCUREMENT
  @Column({ length: 50, default: 'ALL' })
  scope: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
