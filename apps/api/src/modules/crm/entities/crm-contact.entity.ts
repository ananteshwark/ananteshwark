import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ContactSource {
  WEBSITE = 'WEBSITE',
  REFERRAL = 'REFERRAL',
  EVENT = 'EVENT',
  SOCIAL = 'SOCIAL',
  COLD_CALL = 'COLD_CALL',
  OTHER = 'OTHER',
}

export enum ContactStatus {
  LEAD = 'LEAD',
  PROSPECT = 'PROSPECT',
  CUSTOMER = 'CUSTOMER',
  CHURNED = 'CHURNED',
}

@Entity('crm_contacts')
export class CrmContact {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'first_name', length: 100 }) firstName: string;
  @Column({ name: 'last_name', length: 100 }) lastName: string;
  @Column({ type: 'varchar', nullable: true }) email: string | null;
  @Column({ type: 'varchar', nullable: true }) phone: string | null;
  @Column({ type: 'varchar', nullable: true }) company: string | null;
  @Column({ type: 'varchar', nullable: true }) title: string | null;
  @Column({ type: 'enum', enum: ContactSource, default: ContactSource.OTHER }) source: ContactSource;
  @Column({ type: 'enum', enum: ContactStatus, default: ContactStatus.LEAD }) status: ContactStatus;
  @Column({ name: 'owner_id', type: 'varchar' }) ownerId: string;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
