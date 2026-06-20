import { IsString, IsOptional, IsEnum, IsInt, IsDateString, IsNumber, Min } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { RequisitionPriority } from '../entities/manpower-requisition.entity';

export class CreateRequisitionDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  functionId?: string;

  @IsOptional()
  @IsString()
  designationId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  vacancies?: number;

  @IsOptional()
  @IsString()
  employmentType?: string;

  @IsOptional()
  @IsEnum(RequisitionPriority)
  priority?: RequisitionPriority;

  @IsString()
  jobDescription: string;

  @IsOptional()
  @IsString()
  requirements?: string;

  @IsOptional()
  @IsString()
  justification?: string;

  @IsOptional()
  @IsDateString()
  expectedJoiningDate?: string;

  @IsOptional()
  @IsNumber()
  budgetMin?: number;

  @IsOptional()
  @IsNumber()
  budgetMax?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  location?: string;
}

export class UpdateRequisitionDto extends PartialType(CreateRequisitionDto) {}

export class RejectRequisitionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
