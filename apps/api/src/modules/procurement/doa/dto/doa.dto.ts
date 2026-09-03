import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsInt, IsBoolean, IsUUID, Min } from 'class-validator';

export class CreateDoaRuleDto {
  @ApiProperty({ enum: ['PR', 'PO'] })
  @IsString()
  documentType: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  level: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountFrom?: number;

  @ApiPropertyOptional({ description: 'null means unlimited' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountTo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  approverUserId?: string;

  @ApiProperty()
  @IsString()
  approverRole: string;

  @ApiProperty()
  @IsString()
  approverName: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDoaRuleDto {
  @ApiPropertyOptional({ enum: ['PR', 'PO'] })
  @IsOptional()
  @IsString()
  documentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountTo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  approverUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  approverRole?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  approverName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
