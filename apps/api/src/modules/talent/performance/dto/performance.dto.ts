import { IsString, IsOptional, IsEnum, IsNumber, IsArray, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewType } from '../entities/review-cycle.entity';

export class CreateReviewCycleDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional({ enum: ReviewType }) @IsOptional() @IsEnum(ReviewType) type?: ReviewType;
  @ApiProperty() @IsString() startDate: string;
  @ApiProperty() @IsString() endDate: string;
  @ApiProperty() @IsString() selfReviewDeadline: string;
  @ApiProperty() @IsString() managerReviewDeadline: string;
  @ApiPropertyOptional() @IsOptional() @IsString() calibrationDate?: string;
}

export class LaunchReviewsDto {
  @ApiProperty() @IsArray() employeeIds: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() sections?: any[];
}

export class SubmitReviewDto {
  @ApiPropertyOptional() @IsOptional() responses?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsNumber() overallRating?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() comments?: string;
}

export class CreateCalibrationDto {
  @ApiProperty() @IsString() cycleId: string;
  @ApiProperty() @IsString() facilitatorId: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() employeeIds?: string[];
  @ApiProperty() @IsString() sessionDate: string;
}

export class RecordCalibrationDto {
  @ApiPropertyOptional() @IsOptional() ratings?: Record<string, number>;
  @ApiPropertyOptional() @IsOptional() recommendations?: Record<string, string>;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
