import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';

export class UpdateWorkflowConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requirePrApproval?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  prApprovalThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireRfqStep?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  rfqThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requirePoApproval?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  poApprovalThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requirePoRelease?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireThreeWayMatch?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowPartialGrn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoClosePoOnFullReceipt?: boolean;
}
