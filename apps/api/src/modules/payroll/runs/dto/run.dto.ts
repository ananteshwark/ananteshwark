import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { PayrollRunType } from '../entities/payroll-run.entity';

export class CreatePayrollRunDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  payPeriodMonth: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  payPeriodYear: number;

  @ApiPropertyOptional({ enum: PayrollRunType })
  @IsOptional()
  @IsEnum(PayrollRunType)
  runType?: PayrollRunType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  payDate?: string;

  @ApiPropertyOptional({ default: 'INR', description: 'ISO 4217 currency code' })
  @IsOptional()
  @IsString()
  currency?: string;
}
