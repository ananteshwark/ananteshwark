import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, MinLength, Matches, IsArray } from 'class-validator';
import { TenantPlan } from '../entities/tenant.entity';

export class CreateTenantDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ description: 'URL-friendly slug (lowercase letters, numbers, hyphens)' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase letters, numbers and hyphens' })
  slug: string;

  @ApiPropertyOptional({ enum: TenantPlan })
  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;
}

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  branding?: {
    primaryColor?: string;
    logoUrl?: string;
  };

  @ApiPropertyOptional()
  @IsOptional()
  locale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  fiscalYearStart?: number;

  @ApiPropertyOptional()
  @IsOptional()
  baseCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  enabledModules?: string[];
}

// Tenant-admin self-service: choose which of the licensed modules are active.
export class UpdateTenantModulesDto {
  @ApiProperty({ type: [String], description: 'Modules to keep active (must be a subset of the license)' })
  @IsArray()
  @IsString({ each: true })
  enabledModules: string[];
}
