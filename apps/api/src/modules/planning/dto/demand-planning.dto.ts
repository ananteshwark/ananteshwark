import {
  IsString,
  IsOptional,
  IsNumber,
  IsUUID,
  IsEnum,
  IsInt,
  IsArray,
  Min,
} from 'class-validator';
import { ForecastMethod } from '../entities/demand-forecast.entity';

export class GenerateForecastDto {
  @IsUUID()
  itemId: string;

  @IsEnum(ForecastMethod)
  method: ForecastMethod;

  @IsOptional()
  @IsInt()
  @Min(1)
  historyMonths?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  horizonPeriods?: number;

  /** MOVING_AVERAGE: number of trailing periods to average. */
  @IsOptional()
  @IsInt()
  @Min(1)
  windowSize?: number;

  /** WEIGHTED_MOVING_AVERAGE: weights, most-recent last. */
  @IsOptional()
  @IsArray()
  weights?: number[];

  /** EXPONENTIAL_SMOOTHING: smoothing factor 0..1. */
  @IsOptional()
  @IsNumber()
  alpha?: number;

  /** MANUAL: flat quantity applied to every horizon period. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  manualQty?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AdjustPeriodDto {
  @IsNumber()
  @Min(0)
  adjustedQty: number;
}

export class RecordActualDto {
  @IsNumber()
  @Min(0)
  actualQty: number;
}
