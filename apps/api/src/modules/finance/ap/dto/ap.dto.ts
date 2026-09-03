import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsUUID,
  IsInt,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  Min,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VendorStatus } from '../entities/vendor.entity';
import { PaymentMethod } from '../entities/vendor-payment.entity';

export class CreateVendorDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  address?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  paymentTerms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: VendorStatus })
  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  apAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  // ─── Phase 30: Vendor Master Enrichment (additive) ───
  @ApiPropertyOptional({ example: 'NET_30' })
  @IsOptional()
  @IsString()
  paymentTermsCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankIfsc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  swift?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  defaultTaxCodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  panNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gstNumber?: string;

  @ApiPropertyOptional({ example: 'DOMESTIC' })
  @IsOptional()
  @IsString()
  vendorType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  reconciliationAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paymentBlock?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  orderBlock?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  blockReason?: string;
}

export class UpdateVendorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  address?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  paymentTerms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: VendorStatus })
  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  apAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  // ─── Phase 30: Vendor Master Enrichment (additive) ───
  @ApiPropertyOptional({ example: 'NET_30' })
  @IsOptional()
  @IsString()
  paymentTermsCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankIfsc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  swift?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  defaultTaxCodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  panNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gstNumber?: string;

  @ApiPropertyOptional({ example: 'DOMESTIC' })
  @IsOptional()
  @IsString()
  vendorType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  reconciliationAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paymentBlock?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  orderBlock?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  blockReason?: string;
}

export class BillLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsUUID()
  accountId: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ default: 0, description: 'Tax rate as percentage, e.g. 10 for 10%' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;
}

export class CreateBillDto {
  @ApiProperty()
  @IsString()
  billNumber: string;

  @ApiProperty()
  @IsUUID()
  vendorId: string;

  @ApiProperty({ example: '2026-01-15' })
  @IsDateString()
  billDate: string;

  @ApiPropertyOptional({ example: '2026-02-14' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [BillLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BillLineDto)
  lines: BillLineDto[];
}

export class UpdateBillDto {
  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsOptional()
  @IsDateString()
  billDate?: string;

  @ApiPropertyOptional({ example: '2026-02-14' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [BillLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillLineDto)
  lines?: BillLineDto[];
}

export class PaymentAllocationDto {
  @ApiProperty()
  @IsUUID()
  billId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount: number;
}

export class CreateVendorPaymentDto {
  @ApiProperty()
  @IsUUID()
  vendorId: string;

  @ApiProperty({ example: '2026-01-20' })
  @IsDateString()
  paymentDate: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: 'Bank account to credit; defaults to a Cash/Bank GL account' })
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @ApiPropertyOptional({ description: 'GL account to credit (Bank/Cash) if no bankAccountId' })
  @IsOptional()
  @IsUUID()
  creditAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ type: [PaymentAllocationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations?: PaymentAllocationDto[];

  @ApiPropertyOptional({ description: 'Cash discount taken; allocations clear bills gross, bank credited net (Phase 85)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cashDiscountTotal?: number;

  @ApiPropertyOptional({ description: 'GL account to credit for the cash discount; defaults to Cash Discount Received' })
  @IsOptional()
  @IsUUID()
  cashDiscountAccountId?: string;
}

export class AllocatePaymentDto {
  @ApiProperty({ type: [PaymentAllocationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations: PaymentAllocationDto[];
}
