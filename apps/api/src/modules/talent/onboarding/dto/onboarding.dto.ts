import { IsString, IsOptional, IsBoolean, IsArray, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTemplateDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsArray() tasks?: any[];
}

export class CreateOnboardingPlanDto {
  @ApiProperty() @IsString() employeeId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string;
  @ApiProperty() @IsString() startDate: string;
  @ApiProperty() @IsString() targetCompletionDate: string;
}

export class UpdateTaskStatusDto {
  @ApiProperty() @IsString() status: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
