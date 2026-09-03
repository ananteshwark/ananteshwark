import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ComplianceType {
  PF = 'PF',
  ESI = 'ESI',
  PT = 'PT',
  TDS = 'TDS',
  GST = 'GST',
  OTHER = 'OTHER',
}

export enum ComplianceFrequency {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUAL = 'ANNUAL',
}

export enum ComplianceStatus {
  PENDING = 'PENDING',
  FILED = 'FILED',
  OVERDUE = 'OVERDUE',
}

@Entity('pay_compliance_calendar')
@Index(['tenantId', 'dueDate'])
export class ComplianceCalendarItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 200 })
  title: string;

  @Column({ name: 'compliance_type', type: 'enum', enum: ComplianceType })
  complianceType: ComplianceType;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ type: 'enum', enum: ComplianceFrequency, default: ComplianceFrequency.MONTHLY })
  frequency: ComplianceFrequency;

  @Column({ type: 'enum', enum: ComplianceStatus, default: ComplianceStatus.PENDING })
  status: ComplianceStatus;

  @Column({ name: 'filed_at', type: 'timestamp', nullable: true })
  filedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
