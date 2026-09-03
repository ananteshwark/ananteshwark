import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsDateString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GrnLineDto {
  @ApiProperty()
  @IsUUID()
  poLineId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  quantityReceived: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  quantityAccepted: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityRejected?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class CreateGrnDto {
  @ApiProperty()
  @IsUUID()
  poId: string;

  @ApiProperty()
  @IsDateString()
  receiptDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [GrnLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GrnLineDto)
  lines: GrnLineDto[];
}
