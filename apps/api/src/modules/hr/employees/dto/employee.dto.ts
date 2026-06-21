import { IsString, IsOptional, IsEmail, IsEnum, IsUUID, IsDateString, IsBoolean, MinLength, IsArray, ValidateNested } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Gender, MaritalStatus, EmployeeStatus, EmploymentType } from '../entities/employee.entity';
import { OrgLevel } from '../entities/org-level-config.entity';

export class CreateEmployeeDto {
  @IsString()
  employeeCode: string;

  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsEmail()
  personalEmail?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  homePhone?: string;

  // Personal details
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  pan?: string;

  @IsOptional()
  @IsString()
  aadhar?: string;

  @IsOptional()
  @IsString()
  passportNumber?: string;

  @IsOptional()
  @IsDateString()
  passportExpiry?: string;

  // Current address
  @IsOptional()
  @IsString()
  currentAddressLine1?: string;

  @IsOptional()
  @IsString()
  currentAddressLine2?: string;

  @IsOptional()
  @IsString()
  currentCity?: string;

  @IsOptional()
  @IsString()
  currentState?: string;

  @IsOptional()
  @IsString()
  currentCountry?: string;

  @IsOptional()
  @IsString()
  currentPincode?: string;

  // Permanent address
  @IsOptional()
  @IsString()
  permanentAddressLine1?: string;

  @IsOptional()
  @IsString()
  permanentAddressLine2?: string;

  @IsOptional()
  @IsString()
  permanentCity?: string;

  @IsOptional()
  @IsString()
  permanentState?: string;

  @IsOptional()
  @IsString()
  permanentCountry?: string;

  @IsOptional()
  @IsString()
  permanentPincode?: string;

  // Emergency contact
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactRelation?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  // Banking
  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  bankIfsc?: string;

  @IsOptional()
  @IsString()
  bankBranch?: string;

  // Employment
  @IsDateString()
  dateOfJoining: string;

  @IsOptional()
  @IsDateString()
  dateOfLeaving?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsDateString()
  probationEndDate?: string;

  @IsOptional()
  @IsDateString()
  confirmationDate?: string;

  // Org hierarchy
  @IsOptional()
  @IsUUID()
  designationId?: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string;

  @IsUUID()
  businessUnitId: string;

  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsUUID()
  departmentId: string;

  @IsUUID()
  functionId: string;

  @IsOptional()
  @IsUUID()
  subFunctionId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  // Login account provisioning (not persisted — handled in service)
  @IsOptional()
  @IsBoolean()
  createLoginAccount?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  loginPassword?: string;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

export class BulkCreateEmployeeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEmployeeDto)
  rows: CreateEmployeeDto[];
}

export class CreateLegalEntityDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  registrationNo?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsUUID()
  headEmployeeId?: string;

  @IsOptional()
  isActive?: boolean;
}

export class UpdateLegalEntityDto extends PartialType(CreateLegalEntityDto) {}

export class CreateBusinessUnitDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string;

  @IsOptional()
  @IsUUID()
  headEmployeeId?: string;

  @IsOptional()
  isActive?: boolean;
}

export class UpdateBusinessUnitDto extends PartialType(CreateBusinessUnitDto) {}

export class CreateDivisionDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsUUID()
  businessUnitId: string;

  @IsOptional()
  @IsUUID()
  headEmployeeId?: string;

  @IsOptional()
  isActive?: boolean;
}

export class UpdateDivisionDto extends PartialType(CreateDivisionDto) {}

export class CreateDepartmentDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  // A department roots under a Business Unit, optionally via a Division, and may
  // nest under a parent Department. businessUnitId is optional when a division
  // or parent department is supplied (the BU is inferred from them).
  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  headEmployeeId?: string;

  @IsOptional()
  isActive?: boolean;
}

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}

export class CreateFunctionDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsUUID()
  departmentId: string;

  @IsOptional()
  @IsUUID()
  headEmployeeId?: string;

  @IsOptional()
  isActive?: boolean;
}

export class UpdateFunctionDto extends PartialType(CreateFunctionDto) {}

export class CreateSubFunctionDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsUUID()
  functionId: string;

  @IsOptional()
  isActive?: boolean;
}

export class UpdateSubFunctionDto extends PartialType(CreateSubFunctionDto) {}

export class CreateTeamDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsUUID()
  subFunctionId: string;

  @IsOptional()
  @IsUUID()
  headEmployeeId?: string;

  @IsOptional()
  isActive?: boolean;
}

export class UpdateTeamDto extends PartialType(CreateTeamDto) {}

export class CreateDesignationDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  level?: number;

  @IsOptional()
  isActive?: boolean;
}

export class UpdateDesignationDto extends PartialType(CreateDesignationDto) {}

export class CreateLocationDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  isActive?: boolean;
}

export class UpdateLocationDto extends PartialType(CreateLocationDto) {}

export class OrgLevelConfigItemDto {
  @IsEnum(OrgLevel)
  level: OrgLevel;

  @IsBoolean()
  enabled: boolean;

  @IsBoolean()
  required: boolean;
}

export class UpdateOrgLevelConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrgLevelConfigItemDto)
  configs: OrgLevelConfigItemDto[];
}
