import {
  IsString,
  IsArray,
  IsUrl,
  IsOptional,
  IsBoolean,
  IsInt,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export class CreateWebhookSubscriptionDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsUrl({ require_tld: false })
  targetUrl: string;

  @IsArray()
  @IsString({ each: true })
  eventTypes: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;
}

export class UpdateWebhookSubscriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  targetUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eventTypes?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;
}
