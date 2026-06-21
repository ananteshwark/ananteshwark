import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

// Top of the org hierarchy beneath the tenant. A single tenant (group) may own
// several legal entities / operating companies:
// Organization > Legal Entity > Business Unit > Division > Department > Function > Sub Function > Team.
@Entity('hr_legal_entities')
@Index(['code', 'tenantId'], { unique: true })
export class LegalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'registration_no', length: 100, nullable: true })
  registrationNo: string | null;

  @Column({ name: 'tax_id', length: 100, nullable: true })
  taxId: string | null;

  @Column({ length: 100, nullable: true })
  country: string | null;

  @Column({ name: 'head_employee_id', type: 'uuid', nullable: true })
  headEmployeeId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
