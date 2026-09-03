import { IsString, IsOptional, IsNumber, IsDateString, IsArray, ValidateNested, IsEnum, IsUUID, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BenefitPlanType, BenefitPlanStatus } from '../entities/benefit-plan.entity';
import { MeritCycleStatus } from '../entities/merit-cycle.entity';
import { AllocationStatus } from '../entities/merit-allocation.entity';

export class CreateBenefitPlanDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: BenefitPlanType }) @IsEnum(BenefitPlanType) type: BenefitPlanType;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() employerContribution?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() employeeContribution?: number;
  @ApiPropertyOptional() @IsOptional() @IsIn(['FIXED', 'PERCENTAGE']) contributionType?: 'FIXED' | 'PERCENTAGE';
  @ApiProperty() @IsDateString() effectiveFrom: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
}

export class DependentDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() relationship: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dob?: string;
}

export class CreateEnrollmentDto {
  @ApiProperty() @IsUUID() employeeId: string;
  @ApiProperty() @IsUUID() planId: string;
  @ApiProperty() @IsDateString() enrollmentDate: string;
  @ApiPropertyOptional({ type: [DependentDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DependentDto) dependents?: DependentDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class TerminateEnrollmentDto {
  @ApiProperty() @IsDateString() terminationDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateSalaryBandDto {
  @ApiProperty() @IsString() grade: string;
  @ApiProperty() @IsString() level: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jobFamily?: string;
  @ApiProperty() @IsNumber() minimum: number;
  @ApiProperty() @IsNumber() midpoint: number;
  @ApiProperty() @IsNumber() maximum: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiProperty() @IsDateString() effectiveFrom: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
}

export class CreateMeritCycleDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsNumber() year: number;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() budgetPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateCycleStatusDto {
  @ApiProperty({ enum: MeritCycleStatus }) @IsEnum(MeritCycleStatus) status: MeritCycleStatus;
}

export class MeritAllocationLineDto {
  @ApiProperty() @IsUUID() employeeId: string;
  @ApiProperty() @IsNumber() currentSalary: number;
  @ApiProperty() @IsNumber() proposedIncreasePct: number;
}

export class BulkAllocateDto {
  @ApiProperty({ type: [MeritAllocationLineDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => MeritAllocationLineDto) lines: MeritAllocationLineDto[];
}

export class ApproveAllocationDto {
  @ApiProperty({ enum: AllocationStatus }) @IsEnum(AllocationStatus) status: AllocationStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() comments?: string;
}
