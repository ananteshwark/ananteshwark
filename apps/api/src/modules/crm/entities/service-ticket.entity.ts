import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_CUSTOMER = 'PENDING_CUSTOMER',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

@Entity('crm_service_tickets')
@Index(['tenantId', 'ticketNumber'], { unique: true })
export class ServiceTicket {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'ticket_number', length: 50 }) ticketNumber: string;
  @Column({ name: 'customer_id', type: 'uuid', nullable: true }) customerId: string | null;
  @Column({ name: 'contact_id', type: 'uuid', nullable: true }) contactId: string | null;
  @Column({ length: 250 }) subject: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'enum', enum: TicketPriority, default: TicketPriority.MEDIUM }) priority: TicketPriority;
  @Column({ type: 'varchar', nullable: true }) category: string | null;
  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN }) status: TicketStatus;
  @Column({ name: 'assigned_to_user_id', type: 'uuid', nullable: true }) assignedToUserId: string | null;
  @Column({ name: 'sla_response_due_at', type: 'timestamp', nullable: true }) slaResponseDueAt: Date | null;
  @Column({ name: 'sla_resolution_due_at', type: 'timestamp', nullable: true }) slaResolutionDueAt: Date | null;
  @Column({ name: 'first_response_at', type: 'timestamp', nullable: true }) firstResponseAt: Date | null;
  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true }) resolvedAt: Date | null;
  @Column({ name: 'sla_breached', type: 'boolean', default: false }) slaBreached: boolean;
  @Column({ name: 'csat_score', type: 'int', nullable: true }) csatScore: number | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
