import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, IsUUID, IsObject, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SsoProtocol } from '../entities/sso-provider.entity';
import { SodRiskLevel } from '../entities/sod-rule.entity';
import { TaxType } from '../entities/tax-code.entity';
import { RetentionAction } from '../entities/data-retention-policy.entity';

export class CreateSsoProviderDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: SsoProtocol }) @IsEnum(SsoProtocol) protocol: SsoProtocol;
  @ApiPropertyOptional() @IsOptional() @IsString() issuerUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() metadataUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientSecret?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() attributeMapping?: Record<string, string>;
}

export class CreateSodRuleDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() permissionA: string;
  @ApiProperty() @IsString() permissionB: string;
  @ApiProperty({ enum: SodRiskLevel }) @IsEnum(SodRiskLevel) riskLevel: SodRiskLevel;
}

export class CreateTaxCodeDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: TaxType }) @IsEnum(TaxType) type: TaxType;
  @ApiProperty() @IsNumber() rate: number;
  @ApiPropertyOptional() @IsOptional() @IsString() glAccountCode?: string;
  @ApiProperty() @IsDateString() effectiveFrom: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
}

export class ComputeTaxDto {
  @ApiProperty() @IsNumber() amount: number;
  @ApiProperty() @IsString() taxCode: string;
}

export class CreateRetentionPolicyDto {
  @ApiProperty() @IsString() entityName: string;
  @ApiProperty() @IsNumber() retentionDays: number;
  @ApiProperty({ enum: RetentionAction }) @IsEnum(RetentionAction) action: RetentionAction;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
