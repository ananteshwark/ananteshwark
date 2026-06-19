import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsDateString,
  IsArray,
  Min,
  NotEquals,
} from 'class-validator';
import { BankAccountStatus } from '../entities/bank-account.entity';

export class CreateBankAccountDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ description: 'GL Account ID to link this bank account to' })
  @IsUUID()
  glAccountId: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  openingBalance?: number;
}

export class UpdateBankAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: BankAccountStatus })
  @IsOptional()
  @IsEnum(BankAccountStatus)
  status?: BankAccountStatus;
}

export class CreateTransactionDto {
  @ApiProperty({ description: 'Bank account to post this transaction against' })
  @IsUUID()
  bankAccountId: string;

  @ApiProperty({ example: '2026-01-15' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Signed amount: positive = deposit, negative = withdrawal' })
  @IsNumber()
  @NotEquals(0)
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ description: 'GL account to use as the offsetting entry' })
  @IsUUID()
  offsetAccountId: string;
}

export class ReconcileDto {
  @ApiProperty()
  @IsUUID()
  bankAccountId: string;

  @ApiProperty({ example: '2026-01-31' })
  @IsDateString()
  statementDate: string;

  @ApiProperty()
  @IsNumber()
  statementBalance: number;

  @ApiPropertyOptional({ type: [String], description: 'Transaction IDs to mark as reconciled' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  transactionIds?: string[];
}
