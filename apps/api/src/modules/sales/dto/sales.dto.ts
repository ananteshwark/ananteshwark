import { IsString, IsEnum, IsNumber, IsOptional, IsDateString, IsArray, ValidateNested, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { SalesOrderStatus } from '../entities/sales-order.entity';

export class SalesOrderLineDto {
  @ApiProperty() @IsString() itemName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() itemCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsNumber() quantity: number;
  @ApiProperty() @IsNumber() unitPrice: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() discountPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() taxPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() inventoryItemId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
}

export class CreateSalesOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() quoteId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactName?: string;
  @ApiProperty() @IsDateString() orderDate: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expectedDeliveryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() shippingAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() billingAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() priceListId?: string;
  @ApiProperty({ type: [SalesOrderLineDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => SalesOrderLineDto) lines: SalesOrderLineDto[];
}

export class UpdateSalesOrderDto extends PartialType(CreateSalesOrderDto) {}

export class ShipOrderDto {
  @ApiProperty() @IsDateString() shippedDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional({ type: Object }) @IsOptional() lineQties?: Record<string, number>;
}

export class CreatePriceListDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validTo?: string;
}

export class PriceListItemDto {
  @ApiProperty() @IsString() itemCode: string;
  @ApiProperty() @IsString() itemName: string;
  @ApiProperty() @IsNumber() unitPrice: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() minQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() discountPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
}
