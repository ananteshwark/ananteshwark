import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsUUID,
  IsDateString,
  Min,
} from 'class-validator';

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
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string | null;
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
