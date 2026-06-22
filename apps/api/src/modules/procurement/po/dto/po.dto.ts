import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsDateString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PoLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemCode?: string;

  @ApiPropertyOptional({ description: 'Inventory item ID — used to auto-populate price from a purchasing info record' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

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

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  requisitionLineId?: string;

  @ApiPropertyOptional({ description: 'Marks this line as a service line (Phase 33)' })
  @IsOptional()
  @IsBoolean()
  isService?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceUom?: string;
}

export class CreatePoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  rfqId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  requisitionId?: string;

  @ApiProperty()
  @IsString()
  vendorId: string;

  @ApiProperty()
  @IsString()
  vendorName: string;

  @ApiProperty()
  @IsDateString()
  poDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @ApiPropertyOptional({ default: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  termsConditions?: string;

  @ApiProperty({ type: [PoLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PoLineDto)
  lines: PoLineDto[];
}

export class UpdatePoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  termsConditions?: string;

  @ApiPropertyOptional({ type: [PoLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoLineDto)
  lines?: PoLineDto[];
}
