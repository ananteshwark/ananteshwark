import {
  IsString,
  IsUUID,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  IsDateString,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuotaArrangementStatus } from '../entities/quota-arrangement.entity';

export class CreateSourceListDto {
  @IsUUID()
  itemId: string;

  @IsOptional()
  @IsString()
  itemCode?: string;

  @IsOptional()
  @IsString()
  itemDescription?: string;

  @IsString()
  vendorId: string;

  @IsOptional()
  @IsString()
  vendorName?: string;

  @IsOptional()
  @IsString()
  plant?: string;

  @IsDateString()
  validFrom: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isFixed?: boolean;

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;

  @IsOptional()
  @IsUUID()
  infoRecordId?: string;

  @IsOptional()
  @IsUUID()
  outlineAgreementId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderQty?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSourceListDto {
  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isFixed?: boolean;

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;

  @IsOptional()
  @IsUUID()
  infoRecordId?: string;

  @IsOptional()
  @IsUUID()
  outlineAgreementId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderQty?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QuotaItemDto {
  @IsString()
  vendorId: string;

  @IsString()
  vendorName: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  quotaPercentage: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxQuantity?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;
}

export class CreateQuotaArrangementDto {
  @IsUUID()
  itemId: string;

  @IsOptional()
  @IsString()
  itemCode?: string;

  @IsOptional()
  @IsString()
  itemDescription?: string;

  @IsDateString()
  validFrom: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotaItemDto)
  items: QuotaItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateQuotaArrangementDto {
  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsEnum(QuotaArrangementStatus)
  status?: QuotaArrangementStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotaItemDto)
  items?: QuotaItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class DetermineSourceDto {
  @IsUUID()
  itemId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsDateString()
  requiredDate?: string;
}
