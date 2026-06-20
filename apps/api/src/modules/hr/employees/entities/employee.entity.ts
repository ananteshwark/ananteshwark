import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export enum MaritalStatus {
  SINGLE = 'SINGLE',
  MARRIED = 'MARRIED',
  DIVORCED = 'DIVORCED',
  WIDOWED = 'WIDOWED',
}

export enum EmployeeStatus {
  ACTIVE = 'ACTIVE',
  ON_LEAVE = 'ON_LEAVE',
  TERMINATED = 'TERMINATED',
  RESIGNED = 'RESIGNED',
}

export enum EmploymentType {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  CONTRACT = 'CONTRACT',
  INTERN = 'INTERN',
}

@Entity('hr_employees')
@Index(['employeeCode', 'tenantId'], { unique: true })
@Index(['email', 'tenantId'], { unique: true })
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_code', length: 50 })
  employeeCode: string;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @Column({ length: 255 })
  email: string;

  @Column({ length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender | null;

  @Column({ name: 'marital_status', type: 'enum', enum: MaritalStatus, nullable: true })
  maritalStatus: MaritalStatus | null;

  @Column({ length: 100, nullable: true })
  nationality: string | null;

  @Column({ length: 20, nullable: true })
  pan: string | null;

  @Column({ length: 20, nullable: true })
  aadhar: string | null;

  @Column({ name: 'date_of_joining', type: 'date' })
  dateOfJoining: string;

  @Column({ name: 'date_of_leaving', type: 'date', nullable: true })
  dateOfLeaving: string | null;

  @Column({ type: 'enum', enum: EmployeeStatus, default: EmployeeStatus.ACTIVE })
  status: EmployeeStatus;

  @Column({ name: 'designation_id', type: 'uuid', nullable: true })
  designationId: string | null;

  // Org hierarchy: Business Unit > Department > Function > Sub Function.
  @Column({ name: 'business_unit_id', type: 'uuid', nullable: true })
  businessUnitId: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column({ name: 'function_id', type: 'uuid', nullable: true })
  functionId: string | null;

  @Column({ name: 'sub_function_id', type: 'uuid', nullable: true })
  subFunctionId: string | null;

  @Column({ name: 'manager_id', type: 'uuid', nullable: true })
  managerId: string | null;

  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId: string | null;

  @Column({ name: 'employment_type', type: 'enum', enum: EmploymentType, default: EmploymentType.FULL_TIME })
  employmentType: EmploymentType;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'probation_end_date', type: 'date', nullable: true })
  probationEndDate: string | null;

  @Column({ name: 'confirmation_date', type: 'date', nullable: true })
  confirmationDate: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
