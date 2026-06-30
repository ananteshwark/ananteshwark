import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { TicketPriority } from '../../entities/service-ticket.entity';

/**
 * Ph-230 — A keyword routing rule for inbound email-to-ticket: when an email
 * subject/body matches the keyword, the new ticket gets this category,
 * priority, and assignee.
 */
@Entity('svc_email_routing_rules')
@Index(['tenantId', 'priorityOrder'])
export class EmailRoutingRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 100 })
  keyword: string;

  @Column({ length: 80, nullable: true })
  category: string | null;

  @Column({ name: 'assign_to_user_id', type: 'uuid', nullable: true })
  assignToUserId: string | null;

  @Column({ name: 'set_priority', type: 'enum', enum: TicketPriority, nullable: true })
  setPriority: TicketPriority | null;

  @Column({ name: 'priority_order', type: 'int', default: 100 })
  priorityOrder: number; // lower = evaluated first

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
