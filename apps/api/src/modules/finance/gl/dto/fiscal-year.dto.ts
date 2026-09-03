import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsDateString, IsUUID, IsBoolean } from 'class-validator';
import { FiscalYearStatus } from '../entities/fiscal-year.entity';
import { PeriodStatus } from '../entities/accounting-period.entity';

export class CreateFiscalYearDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    description: 'Auto-generate 12 monthly periods for this fiscal year',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  generatePeriods?: boolean;
}

export class UpdateFiscalYearDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: FiscalYearStatus })
  @IsOptional()
  @IsEnum(FiscalYearStatus)
  status?: FiscalYearStatus;
}

export class CreatePeriodDto {
  @ApiProperty()
  @IsUUID()
  fiscalYearId: string;

  @ApiProperty({ example: '2026-01' })
  @IsString()
  name: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-01-31' })
  @IsDateString()
  endDate: string;
}

export class UpdatePeriodDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: PeriodStatus })
  @IsOptional()
  @IsEnum(PeriodStatus)
  status?: PeriodStatus;
}
