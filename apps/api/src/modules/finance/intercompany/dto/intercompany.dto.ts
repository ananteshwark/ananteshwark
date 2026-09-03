import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsUUID,
  IsDateString,
  IsEnum,
  Min,
} from 'class-validator';
import { TransferPricingMethod } from '../entities/ic-transfer-price.entity';

export class CreateIcRelationshipDto {
  @IsUUID()
  sellingEntityId: string;

  @IsUUID()
  buyingEntityId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  markupPercent?: number;

  @IsOptional()
  @IsUUID()
  eliminationAccountId?: string | null;

  @IsOptional()
  @IsUUID()
  icCustomerId?: string | null;

  @IsOptional()
  @IsUUID()
  icVendorId?: string | null;

  @IsOptional()
  @IsUUID()
  revenueAccountId?: string | null;

  @IsOptional()
  @IsUUID()
  expenseAccountId?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class UpdateIcRelationshipDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  markupPercent?: number;

  @IsOptional()
  @IsUUID()
  eliminationAccountId?: string | null;

  @IsOptional()
  @IsUUID()
  icCustomerId?: string | null;

  @IsOptional()
  @IsUUID()
  icVendorId?: string | null;

  @IsOptional()
  @IsUUID()
  revenueAccountId?: string | null;

  @IsOptional()
  @IsUUID()
  expenseAccountId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string | null;
}

// ─── Transfer Pricing (Phase 86) ───────────────────────────────────────────────

export class CreateTransferPriceDto {
  @IsUUID()
  sellingEntityId: string;

  @IsUUID()
  buyingEntityId: string;

  @IsOptional()
  @IsString()
  itemCode?: string | null;

  @IsEnum(TransferPricingMethod)
  method: TransferPricingMethod;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPlusPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  marketPrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsDateString()
  validFrom: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateTransferPriceDto {
  @IsOptional()
  @IsEnum(TransferPricingMethod)
  method?: TransferPricingMethod;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPlusPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  marketPrice?: number;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ResolveTransferPriceDto {
  @IsUUID()
  sellingEntityId: string;

  @IsUUID()
  buyingEntityId: string;

  @IsOptional()
  @IsString()
  itemCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseCost?: number;

  @IsOptional()
  @IsDateString()
  asOf?: string;
}

export class GenerateMirrorBillDto {
  @IsUUID()
  arInvoiceId: string;

  @IsUUID()
  relationshipId: string;
}

export class GenerateEliminationDto {
  @IsDateString()
  periodEnd: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;
}

export class CreateIcTransactionDto {
  @IsUUID()
  sellingEntityId: string;

  @IsUUID()
  buyingEntityId: string;

  @IsDateString()
  transactionDate: string;

  @IsNumber()
  @Min(0)
  baseAmount: number;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
