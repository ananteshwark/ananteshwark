import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsNumber,
  IsUUID,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VendorLoginDto {
  @ApiProperty()
  @IsEmail()
  portalEmail: string;

  @ApiProperty()
  @IsString()
  password: string;

  @ApiProperty()
  @IsString()
  tenantId: string;
}

export class EnablePortalDto {
  @ApiProperty()
  @IsString()
  vendorId: string;

  @ApiProperty()
  @IsEmail()
  portalEmail: string;

  @ApiProperty()
  @IsString()
  password: string;
}

export class SubmitQuoteLineDto {
  @ApiProperty()
  @IsUUID()
  lineId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  leadTimeDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SubmitQuoteDto {
  @ApiProperty({ type: [SubmitQuoteLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubmitQuoteLineDto)
  lines: SubmitQuoteLineDto[];
}

export class PortalInvoiceLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  poLineId?: string;

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

export class PortalSubmitInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vendorInvoiceRef?: string;

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

  @ApiProperty({ type: [PortalInvoiceLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PortalInvoiceLineDto)
  lines: PortalInvoiceLineDto[];
}
