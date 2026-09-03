import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum TransferType {
  TRANSFER = 'TRANSFER',
  PROMOTION = 'PROMOTION',
  DEMOTION = 'DEMOTION',
  LATERAL = 'LATERAL',
}

export enum TransferStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  EFFECTIVE = 'EFFECTIVE',
  CANCELLED = 'CANCELLED',
}

@Entity('hr_employee_transfers')
export class EmployeeTransfer {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ type: 'enum', enum: TransferType }) type: TransferType;
  @Column({ name: 'effective_date', type: 'date' }) effectiveDate: string;
  @Column({ name: 'from_department_id', type: 'uuid', nullable: true }) fromDepartmentId: string | null;
  @Column({ name: 'to_department_id', type: 'uuid', nullable: true }) toDepartmentId: string | null;
  @Column({ name: 'from_designation_id', type: 'uuid', nullable: true }) fromDesignationId: string | null;
  @Column({ name: 'to_designation_id', type: 'uuid', nullable: true }) toDesignationId: string | null;
  @Column({ name: 'from_location_id', type: 'uuid', nullable: true }) fromLocationId: string | null;
  @Column({ name: 'to_location_id', type: 'uuid', nullable: true }) toLocationId: string | null;
  @Column({ name: 'from_salary', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer }) fromSalary: number | null;
  @Column({ name: 'to_salary', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer }) toSalary: number | null;
  @Column({ type: 'enum', enum: TransferStatus, default: TransferStatus.PENDING }) status: TransferStatus;
  @Column({ name: 'approved_by_id', type: 'varchar', nullable: true }) approvedById: string | null;
  @Column({ name: 'approved_at', type: 'timestamp', nullable: true }) approvedAt: Date | null;
  @Column({ type: 'text', nullable: true }) remarks: string | null;
  @CreateDateColumn() createdAt: Date;
}
