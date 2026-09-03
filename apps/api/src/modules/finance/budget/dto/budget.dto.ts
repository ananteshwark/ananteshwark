import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateBudgetLineDto {
  @IsOptional()
  @IsUUID()
  budgetId?: string;

  @IsInt()
  fiscalYear: number;

  @IsOptional()
  @IsString()
  period?: string | null;

  @IsOptional()
  @IsUUID()
  glAccountId?: string | null;

  @IsOptional()
  @IsUUID()
  costCenterId?: string | null;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBudgetLineDto {
  @IsOptional()
  @IsInt()
  fiscalYear?: number;

  @IsOptional()
  @IsString()
  period?: string | null;

  @IsOptional()
  @IsUUID()
  glAccountId?: string | null;

  @IsOptional()
  @IsUUID()
  costCenterId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CheckBudgetDto {
  @IsOptional()
  @IsUUID()
  glAccountId?: string | null;

  @IsOptional()
  @IsUUID()
  costCenterId?: string | null;

  @IsNumber()
  amount: number;

  @IsInt()
  fiscalYear: number;

  @IsOptional()
  @IsString()
  period?: string | null;
}
