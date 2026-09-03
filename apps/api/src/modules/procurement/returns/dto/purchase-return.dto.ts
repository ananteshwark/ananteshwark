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
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseReturnLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemDescription?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;
}

export class CreatePurchaseReturnDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  grnId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  poId?: string;

  @ApiProperty()
  @IsUUID()
  vendorId: string;

  @ApiProperty({ example: '2026-01-20' })
  @IsDateString()
  returnDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ type: [PurchaseReturnLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnLineDto)
  lines: PurchaseReturnLineDto[];
}
