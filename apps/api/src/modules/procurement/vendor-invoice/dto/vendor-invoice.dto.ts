import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsUUID,
  IsDateString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  Min,
  IsInt,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VendorInvoiceLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  poLineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  grnLineId?: string;

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

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;
}

export class CreateVendorInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vendorInvoiceRef?: string;

  @ApiProperty()
  @IsString()
  vendorId: string;

  @ApiProperty()
  @IsString()
  vendorName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  poId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  grnId?: string;

  @ApiProperty()
  @IsDateString()
  invoiceDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ default: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [VendorInvoiceLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VendorInvoiceLineDto)
  lines: VendorInvoiceLineDto[];
}

export class RecordPaymentDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount: number;
}

export class RejectInvoiceDto {
  @ApiProperty()
  @IsString()
  reason: string;
}

export class ApproveInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;
}

// ─── Phase 34: Tolerance & blocked-invoice controls ───
export class SaveTolerancePolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePercentTolerance?: number;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  qtyPercentTolerance?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  autoPostWithinTolerance?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class OverrideBlockDto {
  @ApiProperty()
  @IsString()
  note: string;
}

export class ListInvoicesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  poId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
