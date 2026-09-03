import { IsString, IsEnum, IsNumber, IsOptional, IsDateString, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { DepreciationMethod } from '../entities/asset-category.entity';

export class CreateAssetCategoryDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional({ enum: DepreciationMethod }) @IsOptional() @IsEnum(DepreciationMethod) defaultMethod?: DepreciationMethod;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) defaultUsefulLifeMonths?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() assetAccountCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() depreciationAccountCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accumulatedDepAccountCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class UpdateAssetCategoryDto extends PartialType(CreateAssetCategoryDto) {}

export class CreateFixedAssetDto {
  @ApiProperty() @IsString() assetCode: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() categoryId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiProperty() @IsDateString() acquisitionDate: string;
  @ApiProperty() @IsNumber() acquisitionCost: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() residualValue?: number;
  @ApiProperty() @IsInt() @Min(1) usefulLifeMonths: number;
  @ApiProperty({ enum: DepreciationMethod }) @IsEnum(DepreciationMethod) depreciationMethod: DepreciationMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() glAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() depreciationGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accumulatedDepGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateFixedAssetDto extends PartialType(CreateFixedAssetDto) {}

export class DisposeAssetDto {
  @ApiProperty() @IsDateString() disposalDate: string;
  @ApiProperty() @IsNumber() disposalAmount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() disposalReason?: string;
}

export class RunDepreciationDto {
  @ApiProperty() @IsInt() @Min(2000) periodYear: number;
  @ApiProperty() @IsInt() @Min(1) periodMonth: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
