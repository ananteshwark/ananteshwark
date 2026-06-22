import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsDateString } from 'class-validator';

export class CreateDelegationDto {
  @ApiProperty()
  @IsString()
  delegateeUserId: string;

  @ApiPropertyOptional({ description: 'Defaults to the current user if omitted' })
  @IsOptional()
  @IsString()
  delegatorUserId?: string;

  @ApiProperty({ description: 'ISO date (YYYY-MM-DD)' })
  @IsDateString()
  fromDate: string;

  @ApiProperty({ description: 'ISO date (YYYY-MM-DD)' })
  @IsDateString()
  toDate: string;

  @ApiPropertyOptional({ description: 'ALL/HR/FINANCE/PROCUREMENT', default: 'ALL' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateDelegationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  delegateeUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
