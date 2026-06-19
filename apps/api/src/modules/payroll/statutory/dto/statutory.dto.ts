import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsObject,
  IsDateString,
  IsInt,
} from 'class-validator';
import { StatutoryType } from '../../components/entities/pay-component.entity';
import {
  ComplianceType,
  ComplianceFrequency,
} from '../entities/compliance-calendar-item.entity';

export class UpsertStatutoryConfigDto {
  @ApiProperty({ enum: StatutoryType })
  @IsEnum(StatutoryType)
  type: StatutoryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class CreateComplianceItemDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ enum: ComplianceType })
  @IsEnum(ComplianceType)
  complianceType: ComplianceType;

  @ApiProperty()
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ enum: ComplianceFrequency })
  @IsOptional()
  @IsEnum(ComplianceFrequency)
  frequency?: ComplianceFrequency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}
