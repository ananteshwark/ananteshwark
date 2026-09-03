import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';

export class CreateServiceEntryDto {
  @ApiProperty()
  @IsUUID()
  poId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  poLineId?: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  periodFrom: string;

  @ApiProperty({ example: '2026-01-31' })
  @IsDateString()
  periodTo: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiPropertyOptional({ default: 'EA' })
  @IsOptional()
  @IsString()
  uom?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  rate: number;
}

export class RejectServiceEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
