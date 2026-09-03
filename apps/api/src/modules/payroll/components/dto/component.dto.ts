import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsUUID,
  IsArray,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  PayComponentType,
  CalculationType,
  StatutoryType,
} from '../entities/pay-component.entity';

export class CreatePayComponentDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: PayComponentType })
  @IsEnum(PayComponentType)
  type: PayComponentType;

  @ApiPropertyOptional({ enum: CalculationType })
  @IsOptional()
  @IsEnum(CalculationType)
  calculationType?: CalculationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  percentageOf?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  formula?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isStatutory?: boolean;

  @ApiPropertyOptional({ enum: StatutoryType })
  @IsOptional()
  @IsEnum(StatutoryType)
  statutoryType?: StatutoryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  glAccountCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePayComponentDto extends PartialType(CreatePayComponentDto) {}

export class StructureComponentDto {
  @ApiProperty()
  @IsUUID()
  componentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  percentage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sequence?: number;
}

export class CreateSalaryStructureDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [StructureComponentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StructureComponentDto)
  components?: StructureComponentDto[];
}

export class UpdateSalaryStructureDto extends PartialType(CreateSalaryStructureDto) {}

export class AssignSalaryDto {
  @ApiProperty()
  @IsUUID()
  employeeId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  structureId?: string;

  @ApiProperty()
  @IsNumber()
  ctc: number;

  @ApiProperty()
  @IsDateString()
  effectiveFrom: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
