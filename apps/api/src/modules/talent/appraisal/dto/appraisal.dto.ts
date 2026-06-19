import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAppraisalResultDto {
  @ApiProperty() @IsString() reviewCycleId: string;
  @ApiProperty() @IsString() employeeId: string;
  @ApiProperty() @IsNumber() finalRating: number;
  @ApiProperty() @IsString() ratingLabel: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() incrementPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bonusAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() promotionRecommended?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() updatedDesignationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() effectiveDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
