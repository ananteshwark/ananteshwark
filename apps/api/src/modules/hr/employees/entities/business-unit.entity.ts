import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

// Top level of the org hierarchy beneath the Organization (tenant):
// Organization > Business Unit > Department > Function > Sub Function.
@Entity('hr_business_units')
@Index(['code', 'tenantId'], { unique: true })
export class BusinessUnit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  // Business Unit may belong to a Legal Entity (operating company).
  @Column({ name: 'legal_entity_id', type: 'uuid', nullable: true })
  legalEntityId: string | null;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'head_employee_id', type: 'uuid', nullable: true })
  headEmployeeId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
