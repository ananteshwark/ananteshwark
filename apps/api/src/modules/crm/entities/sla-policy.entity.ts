import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { TicketPriority } from './service-ticket.entity';

@Entity('crm_sla_policies')
@Index(['tenantId', 'priority'], { unique: true })
export class SlaPolicy {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ type: 'enum', enum: TicketPriority }) priority: TicketPriority;
  @Column({ name: 'response_minutes', type: 'int' }) responseMinutes: number;
  @Column({ name: 'resolution_minutes', type: 'int' }) resolutionMinutes: number;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
