import { IsString, IsOptional, IsNumber, IsDateString, IsArray, ValidateNested, IsBoolean, IsEnum, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { InspectionType } from '../entities/inspection-plan.entity';
import { LotReferenceType, UsageDecision } from '../entities/inspection-lot.entity';
import { NcrSeverity } from '../entities/non-conformance.entity';

export class CheckpointDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: ['PASS_FAIL', 'NUMERIC', 'TEXT'] }) @IsEnum(['PASS_FAIL', 'NUMERIC', 'TEXT']) type: 'PASS_FAIL' | 'NUMERIC' | 'TEXT';
  @ApiPropertyOptional() @IsOptional() @IsString() spec?: string;
}

export class CreateInspectionPlanDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() itemCode: string;
  @ApiProperty() @IsString() itemName: string;
  @ApiProperty({ enum: InspectionType }) @IsEnum(InspectionType) inspectionType: InspectionType;
  @ApiProperty({ type: [CheckpointDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => CheckpointDto) checkpoints: CheckpointDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateInspectionLotDto {
  @ApiProperty() @IsUUID() planId: string;
  @ApiProperty({ enum: LotReferenceType }) @IsEnum(LotReferenceType) referenceType: LotReferenceType;
  @ApiPropertyOptional() @IsOptional() @IsUUID() referenceId?: string;
  @ApiProperty() @IsString() itemCode: string;
  @ApiProperty() @IsNumber() quantity: number;
  @ApiProperty() @IsNumber() sampleSize: number;
  @ApiProperty() @IsDateString() inspectionDate: string;
}

export class CheckpointResultDto {
  @ApiProperty() @IsString() checkpointName: string;
  @ApiPropertyOptional() @IsOptional() value?: string | number | null;
  @ApiProperty() @IsBoolean() passed: boolean;
}

export class RecordResultsDto {
  @ApiProperty({ type: [CheckpointResultDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => CheckpointResultDto) results: CheckpointResultDto[];
  @ApiProperty({ enum: UsageDecision }) @IsEnum(UsageDecision) usageDecision: UsageDecision;
  @ApiPropertyOptional() @IsOptional() @IsString() remarks?: string;
}

export class CreateNcrDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() inspectionLotId?: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: NcrSeverity }) @IsEnum(NcrSeverity) severity: NcrSeverity;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedToId?: string;
}

export class ResolveNcrDto {
  @ApiProperty() @IsString() rootCause: string;
  @ApiProperty() @IsString() correctiveAction: string;
  @ApiPropertyOptional() @IsOptional() @IsString() preventiveAction?: string;
}
