import { IsString, IsOptional, IsEmail, IsEnum, IsUUID, IsDateString } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { Gender, MaritalStatus, EmployeeStatus, EmploymentType } from '../entities/employee.entity';

export class CreateEmployeeDto {
  @IsString()
  employeeCode: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

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
  pan?: string;

  @IsOptional()
  @IsString()
  aadhar?: string;

  @IsDateString()
  dateOfJoining: string;

  @IsOptional()
  @IsDateString()
  dateOfLeaving?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsUUID()
  designationId?: string;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  functionId?: string;

  @IsOptional()
  @IsUUID()
  subFunctionId?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsDateString()
  probationEndDate?: string;

  @IsOptional()
  @IsDateString()
  confirmationDate?: string;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

export class CreateBusinessUnitDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsUUID()
  headEmployeeId?: string;

  @IsOptional()
  isActive?: boolean;
}

export class UpdateBusinessUnitDto extends PartialType(CreateBusinessUnitDto) {}

export class CreateDepartmentDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

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

  @IsOptional()
  @IsUUID()
  departmentId?: string;

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
  timezone?: string;

  @IsOptional()
  isActive?: boolean;
}

export class UpdateLocationDto extends PartialType(CreateLocationDto) {}
