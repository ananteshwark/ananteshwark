import { IsString, IsOptional, IsEnum, IsUUID, IsDateString, IsBoolean, IsInt, IsNumber } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { AccrualType } from '../entities/leave-type.entity';
import { HalfDayPeriod } from '../entities/leave-application.entity';

export class CreateLeaveTypeDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsEnum(AccrualType)
  accrualType?: AccrualType;

  @IsOptional()
  @IsNumber()
  accrualRate?: number;

  @IsOptional()
  @IsNumber()
  maxBalance?: number;

  @IsOptional()
  @IsNumber()
  maxCarryForward?: number;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsBoolean()
  isEncashable?: boolean;

  @IsOptional()
  @IsString()
  applicableGender?: string;

  @IsOptional()
  @IsInt()
  minNoticeDays?: number;

  @IsOptional()
  @IsInt()
  maxConsecutiveDays?: number;
}

export class UpdateLeaveTypeDto extends PartialType(CreateLeaveTypeDto) {}

export class ApplyLeaveDto {
  @IsUUID()
  employeeId: string;

  @IsUUID()
  leaveTypeId: string;

  @IsDateString()
  fromDate: string;

  @IsDateString()
  toDate: string;

  @IsNumber()
  days: number;

  @IsString()
  reason: string;

  @IsOptional()
  @IsBoolean()
  halfDay?: boolean;

  @IsOptional()
  @IsEnum(HalfDayPeriod)
  halfDayPeriod?: HalfDayPeriod;
}
