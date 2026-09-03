import { IsString, IsOptional, IsNumber, IsArray, IsBoolean, IsEnum, IsUUID, IsEmail, ValidateNested, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ReportCategory, ReportFormat } from '../entities/report-definition.entity';
import { ScheduleFrequency } from '../entities/report-schedule.entity';
import { BudgetStatus } from '../entities/budget.entity';

export class ReportColumnDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() label: string;
  @ApiProperty({ enum: ['text', 'number', 'date', 'currency'] }) @IsEnum(['text', 'number', 'date', 'currency']) type: 'text' | 'number' | 'date' | 'currency';
  @ApiPropertyOptional() @IsOptional() @IsString() format?: string;
}

export class ReportParameterDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() label: string;
  @ApiProperty({ enum: ['date', 'string', 'number', 'uuid'] }) @IsEnum(['date', 'string', 'number', 'uuid']) type: 'date' | 'string' | 'number' | 'uuid';
  @ApiProperty() @IsBoolean() required: boolean;
}

export class CreateReportDefinitionDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: ReportCategory }) @IsEnum(ReportCategory) category: ReportCategory;
  @ApiPropertyOptional({ enum: ReportFormat }) @IsOptional() @IsEnum(ReportFormat) format?: ReportFormat;
  @ApiProperty() @IsString() sqlQuery: string;
  @ApiPropertyOptional({ type: [ReportParameterDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ReportParameterDto) parameters?: ReportParameterDto[];
  @ApiPropertyOptional({ type: [ReportColumnDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ReportColumnDto) columns?: ReportColumnDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class RunReportDto {
  @ApiPropertyOptional() @IsOptional() @IsObject() parameters?: Record<string, any>;
}

export class CreateScheduleDto {
  @ApiProperty() @IsUUID() reportId: string;
  @ApiProperty({ enum: ScheduleFrequency }) @IsEnum(ScheduleFrequency) frequency: ScheduleFrequency;
  @ApiProperty({ type: [String] }) @IsArray() @IsEmail({}, { each: true }) sendTo: string[];
}

export class BudgetLineDto {
  @ApiProperty() @IsString() accountCode: string;
  @ApiProperty() @IsString() accountName: string;
  @ApiProperty() @IsString() period: string;
  @ApiProperty() @IsNumber() budgetAmount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateBudgetDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsNumber() fiscalYear: number;
  @ApiPropertyOptional({ type: [BudgetLineDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BudgetLineDto) lines?: BudgetLineDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateKpiDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() sqlQuery: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() targetValue?: number;
}
