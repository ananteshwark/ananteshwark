import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';

@Entity('lic_emp_module_assignments')
@Index(['tenantId', 'employeeId', 'moduleKey'], { where: '"is_active" = true' })
export class EmployeeModuleAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'employee_name', length: 300 })
  employeeName: string;

  @Column({ name: 'module_key', length: 100 })
  moduleKey: string;

  @Column({ name: 'assigned_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  assignedAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
