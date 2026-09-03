import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsDateString,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RecognitionMethod } from '../entities/performance-obligation.entity';

export class CreateObligationDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  standaloneSellingPrice: number;

  @IsEnum(RecognitionMethod)
  method: RecognitionMethod;

  /** Required for OVER_TIME: straight-line recognition window. */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CreateRevenueContractDto {
  @IsOptional()
  @IsString()
  contractNumber?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsDateString()
  contractDate: string;

  @IsNumber()
  @Min(0)
  totalTransactionPrice: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsUUID()
  arInvoiceId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateObligationDto)
  obligations: CreateObligationDto[];
}

export class FulfillObligationDto {
  @IsOptional()
  @IsDateString()
  fulfilledDate?: string;
}

export class RecognizeDueDto {
  @IsDateString()
  periodEnd: string;

  @IsOptional()
  @IsUUID()
  contractId?: string;

  /** Override the deferred-revenue control account (else uses default code). */
  @IsOptional()
  @IsUUID()
  deferredRevenueAccountId?: string;

  /** Override the revenue account (else uses default sales-revenue code). */
  @IsOptional()
  @IsUUID()
  revenueAccountId?: string;
}
