import { IsString, IsOptional, IsNumber, IsDateString, IsArray, ValidateNested, IsInt, Min, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BomStatus } from '../entities/bom.entity';

export class BomLineDto {
  @ApiProperty() @IsString() componentCode: string;
  @ApiProperty() @IsString() componentName: string;
  @ApiProperty() @IsNumber() quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() scrapPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPhantom?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() subBomId?: string;
}

export class CreateBomDto {
  @ApiProperty() @IsString() finishedItemCode: string;
  @ApiProperty() @IsString() finishedItemName: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() outputQuantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() outputUom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() version?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [BomLineDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => BomLineDto) lines: BomLineDto[];
}

export class CreateWorkCenterDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() capacityPerHour?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() costPerHour?: number;
}

export class CreateProductionOrderDto {
  @ApiProperty() @IsString() bomId: string;
  @ApiProperty() @IsNumber() plannedQuantity: number;
  @ApiProperty() @IsDateString() plannedStartDate: string;
  @ApiProperty() @IsDateString() plannedEndDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() workCenterId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() salesOrderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CompleteProductionOrderDto {
  @ApiProperty() @IsNumber() producedQuantity: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() scrapQuantity?: number;
  @ApiProperty() @IsDateString() actualEndDate: string;
}

export class IssueMaterialDto {
  @ApiProperty() @IsString() componentCode: string;
  @ApiProperty() @IsString() componentName: string;
  @ApiProperty() @IsNumber() issuedQuantity: number;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() issuedDate?: string;
}

// ─── Phase 46: Routing & Capacity ───────────────────────────────
export class RoutingOperationDto {
  @ApiProperty() @IsInt() sequence: number;
  @ApiProperty() @IsString() workCenterId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() setupMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() runMinutesPerUnit?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() yieldPercent?: number;
}

export class CreateRoutingDto {
  @ApiProperty() @IsString() itemId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() version?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ type: [RoutingOperationDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => RoutingOperationDto) operations: RoutingOperationDto[];
}

export class UpdateRoutingDto extends PartialType(CreateRoutingDto) {}

// ─── Phase 47: MRP ──────────────────────────────────────────────
export class RunMrpDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) horizonDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeForecast?: boolean;
}

// ─── Phase 48: Production Order Costing ──────────────────────────
export class ConfirmOperationDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() operationSequence?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() workCenterId?: string;
  @ApiProperty() @IsNumber() confirmedQty: number;
  @ApiProperty() @IsInt() actualMinutes: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() confirmationDate?: string;
}

export class SettleOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() settleDate?: string;
}
