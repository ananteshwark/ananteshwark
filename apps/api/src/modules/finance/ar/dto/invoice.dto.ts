import { IsString, IsOptional, IsDateString, IsNumber, Min, MaxLength, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvoiceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  invoiceNumber: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  customerName: string;

  @ApiProperty()
  @IsDateString()
  invoiceDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  subTotal: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  taxCodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
