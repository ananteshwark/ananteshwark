import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsDateString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RequisitionPriority } from '../entities/purchase-requisition.entity';

export class RequisitionLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemCode?: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional({ default: 'EA' })
  @IsOptional()
  @IsString()
  uom?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  accountId?: string;
}

export class CreateRequisitionDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: RequisitionPriority })
  @IsOptional()
  @IsEnum(RequisitionPriority)
  priority?: RequisitionPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  requiredBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [RequisitionLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RequisitionLineDto)
  lines: RequisitionLineDto[];
}

export class UpdateRequisitionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: RequisitionPriority })
  @IsOptional()
  @IsEnum(RequisitionPriority)
  priority?: RequisitionPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  requiredBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [RequisitionLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequisitionLineDto)
  lines?: RequisitionLineDto[];
}

export class RejectRequisitionDto {
  @ApiProperty()
  @IsString()
  reason: string;
}
