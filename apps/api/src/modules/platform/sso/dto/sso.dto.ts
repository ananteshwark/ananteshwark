import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  IsUrl,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { SsoProtocol } from '../../entities/sso-provider.entity';

export class CreateSsoProviderDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsEnum(SsoProtocol)
  protocol: SsoProtocol;

  @IsOptional()
  @IsUrl({ require_tld: false })
  issuerUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  metadataUrl?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;

  @IsOptional()
  @IsString()
  certificate?: string;

  @IsOptional()
  @IsObject()
  attributeMapping?: Record<string, string>;
}

export class UpdateSsoProviderDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  issuerUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  metadataUrl?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;

  @IsOptional()
  @IsString()
  certificate?: string;

  @IsOptional()
  @IsObject()
  attributeMapping?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
