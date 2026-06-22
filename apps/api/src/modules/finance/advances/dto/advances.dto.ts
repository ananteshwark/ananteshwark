import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsDateString,
  Min,
} from 'class-validator';

export class CreateVendorAdvanceDto {
  @IsString()
  vendorId: string;

  @IsDateString()
  requestDate: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PayVendorAdvanceDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsDateString()
  paidDate?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class ClearVendorAdvanceDto {
  @IsUUID()
  billId: string;

  @IsNumber()
  @Min(0)
  amount: number;
}

export class CreateCustomerAdvanceDto {
  @IsString()
  customerId: string;

  @IsDateString()
  receiptDate: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ClearCustomerAdvanceDto {
  @IsUUID()
  invoiceId: string;

  @IsNumber()
  @Min(0)
  amount: number;
}
