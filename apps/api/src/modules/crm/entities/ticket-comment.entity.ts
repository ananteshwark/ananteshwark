import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('crm_ticket_comments')
@Index(['tenantId', 'ticketId'])
export class TicketComment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'ticket_id', type: 'uuid' }) ticketId: string;
  @Column({ name: 'author_user_id', type: 'uuid', nullable: true }) authorUserId: string | null;
  @Column({ type: 'text' }) body: string;
  @Column({ name: 'is_internal', type: 'boolean', default: false }) isInternal: boolean;
  @CreateDateColumn() createdAt: Date;
}
