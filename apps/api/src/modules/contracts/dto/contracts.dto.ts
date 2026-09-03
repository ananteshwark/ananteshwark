import { IsString, IsEnum, IsNumber, IsOptional, IsDateString, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ContractType, RenewalType } from '../entities/contract.entity';

export class CreateContractDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ enum: ContractType }) @IsEnum(ContractType) type: ContractType;
  @ApiPropertyOptional() @IsOptional() @IsString() counterpartyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() counterpartyName?: string;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() signedDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() renewalDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) alertDaysBefore?: number;
  @ApiPropertyOptional({ enum: RenewalType }) @IsOptional() @IsEnum(RenewalType) renewalType?: RenewalType;
  @ApiPropertyOptional() @IsOptional() @IsNumber() contractValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() poId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() terms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateContractDto extends PartialType(CreateContractDto) {}

export class CreateMilestoneDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateTemplateDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: ContractType }) @IsEnum(ContractType) type: ContractType;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultTerms?: string;
}
