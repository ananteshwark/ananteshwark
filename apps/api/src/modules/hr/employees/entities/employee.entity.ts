import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, VersionColumn } from 'typeorm';

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

  // ── Identity ──────────────────────────────────────────────────────────────
  @Column({ name: 'employee_code', length: 50 })
  employeeCode: string;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'middle_name', length: 100, nullable: true })
  middleName: string | null;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @Column({ length: 255 })
  email: string;

  @Column({ name: 'personal_email', length: 255, nullable: true })
  personalEmail: string | null;

  @Column({ length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'home_phone', length: 20, nullable: true })
  homePhone: string | null;

  // ── Personal Details ───────────────────────────────────────────────────────
  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender | null;

  @Column({ name: 'marital_status', type: 'enum', enum: MaritalStatus, nullable: true })
  maritalStatus: MaritalStatus | null;

  @Column({ length: 100, nullable: true })
  nationality: string | null;

  @Column({ name: 'blood_group', length: 10, nullable: true })
  bloodGroup: string | null;

  @Column({ length: 20, nullable: true })
  pan: string | null;

  @Column({ length: 20, nullable: true })
  aadhar: string | null;

  @Column({ name: 'passport_number', length: 50, nullable: true })
  passportNumber: string | null;

  @Column({ name: 'passport_expiry', type: 'date', nullable: true })
  passportExpiry: string | null;

  // ── Current Address ────────────────────────────────────────────────────────
  @Column({ name: 'current_address_line1', length: 255, nullable: true })
  currentAddressLine1: string | null;

  @Column({ name: 'current_address_line2', length: 255, nullable: true })
  currentAddressLine2: string | null;

  @Column({ name: 'current_city', length: 100, nullable: true })
  currentCity: string | null;

  @Column({ name: 'current_state', length: 100, nullable: true })
  currentState: string | null;

  @Column({ name: 'current_country', length: 100, nullable: true })
  currentCountry: string | null;

  @Column({ name: 'current_pincode', length: 20, nullable: true })
  currentPincode: string | null;

  // ── Permanent Address ──────────────────────────────────────────────────────
  @Column({ name: 'permanent_address_line1', length: 255, nullable: true })
  permanentAddressLine1: string | null;

  @Column({ name: 'permanent_address_line2', length: 255, nullable: true })
  permanentAddressLine2: string | null;

  @Column({ name: 'permanent_city', length: 100, nullable: true })
  permanentCity: string | null;

  @Column({ name: 'permanent_state', length: 100, nullable: true })
  permanentState: string | null;

  @Column({ name: 'permanent_country', length: 100, nullable: true })
  permanentCountry: string | null;

  @Column({ name: 'permanent_pincode', length: 20, nullable: true })
  permanentPincode: string | null;

  // ── Emergency Contact ──────────────────────────────────────────────────────
  @Column({ name: 'emergency_contact_name', length: 100, nullable: true })
  emergencyContactName: string | null;

  @Column({ name: 'emergency_contact_relation', length: 100, nullable: true })
  emergencyContactRelation: string | null;

  @Column({ name: 'emergency_contact_phone', length: 20, nullable: true })
  emergencyContactPhone: string | null;

  // ── Banking ───────────────────────────────────────────────────────────────
  @Column({ name: 'bank_name', length: 100, nullable: true })
  bankName: string | null;

  @Column({ name: 'bank_account_number', length: 50, nullable: true })
  bankAccountNumber: string | null;

  @Column({ name: 'bank_ifsc', length: 20, nullable: true })
  bankIfsc: string | null;

  @Column({ name: 'bank_branch', length: 100, nullable: true })
  bankBranch: string | null;

  // ── Employment ────────────────────────────────────────────────────────────
  // Which statutory country pack applies to this employee's payroll.
  @Column({ name: 'payroll_country', length: 2, default: 'IN' })
  payrollCountry: string;

  @Column({ name: 'date_of_joining', type: 'date' })
  dateOfJoining: string;

  @Column({ name: 'date_of_leaving', type: 'date', nullable: true })
  dateOfLeaving: string | null;

  @Column({ name: 'probation_end_date', type: 'date', nullable: true })
  probationEndDate: string | null;

  @Column({ name: 'confirmation_date', type: 'date', nullable: true })
  confirmationDate: string | null;

  @Column({ type: 'enum', enum: EmployeeStatus, default: EmployeeStatus.ACTIVE })
  status: EmployeeStatus;

  @Column({ name: 'employment_type', type: 'enum', enum: EmploymentType, default: EmploymentType.FULL_TIME })
  employmentType: EmploymentType;

  // ── Org ───────────────────────────────────────────────────────────────────
  @Column({ name: 'designation_id', type: 'uuid', nullable: true })
  designationId: string | null;

  @Column({ name: 'legal_entity_id', type: 'uuid', nullable: true })
  legalEntityId: string | null;

  @Column({ name: 'business_unit_id', type: 'uuid', nullable: true })
  businessUnitId: string | null;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column({ name: 'function_id', type: 'uuid', nullable: true })
  functionId: string | null;

  @Column({ name: 'sub_function_id', type: 'uuid', nullable: true })
  subFunctionId: string | null;

  @Column({ name: 'team_id', type: 'uuid', nullable: true })
  teamId: string | null;

  @Column({ name: 'manager_id', type: 'uuid', nullable: true })
  managerId: string | null;

  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId: string | null;

  @Column({ name: 'position_id', type: 'uuid', nullable: true })
  positionId: string | null;

  // ── Platform ──────────────────────────────────────────────────────────────
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Optimistic concurrency counter: clients echo it back on update;
  // a stale value is rejected with 409 instead of last-write-wins.
  @VersionColumn({ default: 1 })
  version: number;
}
