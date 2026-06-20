import { IsString, IsOptional, IsNumber, IsDateString, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateDunningLevelDto {
  @ApiProperty() @IsInt() @Min(1) levelNumber: number;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsInt() @Min(0) daysOverdueFrom: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() daysOverdueTo?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() emailSubject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emailBody?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() chargeAmount?: number;
}

export class UpdateDunningLevelDto extends PartialType(CreateDunningLevelDto) {}

export class RunDunningDto {
  @ApiProperty() @IsDateString() runDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreatePaymentPlanDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty() @IsNumber() totalAmount: number;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiProperty() @IsInt() @Min(1) installments: number;
  @ApiPropertyOptional() @IsOptional() @IsString() frequency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
