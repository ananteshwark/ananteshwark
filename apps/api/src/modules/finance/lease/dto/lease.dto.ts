import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsDateString,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { PaymentTiming } from '../entities/lease.entity';

export class CreateLeaseDto {
  @IsOptional()
  @IsString()
  leaseNumber?: string;

  @IsOptional()
  @IsString()
  lessorName?: string;

  @IsOptional()
  @IsString()
  assetDescription?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsDateString()
  startDate: string;

  @IsInt()
  @Min(1)
  termMonths: number;

  @IsNumber()
  @Min(0)
  paymentAmount: number;

  @IsOptional()
  @IsEnum(PaymentTiming)
  paymentTiming?: PaymentTiming;

  /** Annual incremental borrowing rate, percent. */
  @IsNumber()
  @Min(0)
  annualDiscountRate: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  initialDirectCosts?: number;

  // Optional GL account overrides.
  @IsOptional()
  @IsUUID()
  rouAssetAccountId?: string;

  @IsOptional()
  @IsUUID()
  accumAmortAccountId?: string;

  @IsOptional()
  @IsUUID()
  leaseLiabilityAccountId?: string;

  @IsOptional()
  @IsUUID()
  interestExpenseAccountId?: string;

  @IsOptional()
  @IsUUID()
  amortExpenseAccountId?: string;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PostLeasePeriodDto {
  /** Post every unposted line dated on or before this date. */
  @IsDateString()
  periodEnd: string;

  @IsOptional()
  @IsUUID()
  leaseId?: string;
}
