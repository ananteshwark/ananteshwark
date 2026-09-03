import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ar_dunning_levels')
export class DunningLevel {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'level_number', type: 'int' }) levelNumber: number;
  @Column({ length: 100 }) name: string;
  @Column({ name: 'days_overdue_from', type: 'int' }) daysOverdueFrom: number;
  @Column({ name: 'days_overdue_to', type: 'int', nullable: true }) daysOverdueTo: number | null;
  @Column({ name: 'email_subject', length: 300, nullable: true }) emailSubject: string | null;
  @Column({ name: 'email_body', type: 'text', nullable: true }) emailBody: string | null;
  @Column({ name: 'charge_amount', type: 'numeric', precision: 18, scale: 2, default: 0 }) chargeAmount: number;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
