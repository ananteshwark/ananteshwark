import { IsString, IsOptional, IsEnum, IsInt, IsArray, IsDateString, Matches, MinLength, Min, IsEmail } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { TenantPlan, TenantStatus } from '../../tenants/entities/tenant.entity';
import { TenantLicenseTier, TenantLicenseStatus } from '../entities/tenant-license.entity';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase letters, numbers and hyphens' })
  slug: string;

  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;

  // Default tenant admin to create alongside the tenant.
  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(1)
  adminFirstName: string;

  @IsString()
  @MinLength(1)
  adminLastName: string;

  @IsString()
  @MinLength(8)
  adminPassword: string;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}

export class AllocateLicenseDto {
  @IsEnum(TenantLicenseTier)
  tier: TenantLicenseTier;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxEmployees?: number;

  @IsOptional()
  @IsArray()
  enabledModules?: string[];

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsEnum(TenantLicenseStatus)
  status?: TenantLicenseStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateLicenseDto extends PartialType(AllocateLicenseDto) {}
