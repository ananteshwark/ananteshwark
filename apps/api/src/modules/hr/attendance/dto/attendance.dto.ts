import { IsString, IsOptional, IsEnum, IsUUID, IsDateString, IsInt, IsBoolean } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { AttendanceSource, AttendanceStatus } from '../entities/attendance-record.entity';
import { HolidayType } from '../entities/holiday.entity';

export class CreateShiftDto {
  @IsString()
  name: string;

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsOptional()
  @IsInt()
  breakMinutes?: number;

  @IsOptional()
  @IsInt()
  graceMinutesLate?: number;

  @IsOptional()
  @IsInt()
  graceMinutesEarlyLeave?: number;

  @IsOptional()
  @IsBoolean()
  isNightShift?: boolean;
}

export class UpdateShiftDto extends PartialType(CreateShiftDto) {}

export class CreateShiftAssignmentDto {
  @IsUUID()
  employeeId: string;

  @IsUUID()
  shiftId: string;

  @IsDateString()
  effectiveFrom: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class CreateHolidayDto {
  @IsString()
  name: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsEnum(HolidayType)
  type?: HolidayType;
}

export class MarkAttendanceDto {
  @IsUUID()
  employeeId: string;

  @IsDateString()
  date: string;

  @IsOptional()
  checkIn?: string;

  @IsOptional()
  checkOut?: string;

  @IsOptional()
  @IsEnum(AttendanceSource)
  source?: AttendanceSource;

  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateTimeEntryDto {
  @IsUUID()
  employeeId: string;

  @IsDateString()
  date: string;

  @IsString()
  startTime: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  taskDescription?: string;

  @IsOptional()
  @IsString()
  projectCode?: string;
}
