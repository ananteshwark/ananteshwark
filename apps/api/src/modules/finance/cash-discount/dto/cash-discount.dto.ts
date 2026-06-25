import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CashDiscountTierDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent: number;

  @IsInt()
  @Min(0)
  withinDays: number;
}

export class CreatePaymentTermDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsInt()
  @Min(0)
  netDays: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashDiscountTierDto)
  tiers?: CashDiscountTierDto[];

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdatePaymentTermDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  netDays?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashDiscountTierDto)
  tiers?: CashDiscountTierDto[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ComputeDiscountDto {
  @IsString()
  termCode: string;

  @IsNumber()
  @Min(0)
  baseAmount: number;

  /** invoice/bill date — baseline for the discount window */
  @IsDateString()
  baselineDate: string;

  @IsDateString()
  paymentDate: string;
}
