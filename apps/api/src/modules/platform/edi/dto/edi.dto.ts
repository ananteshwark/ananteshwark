import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  MaxLength,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { EdiDirection } from '../entities/edi-transaction.entity';

export class CreateTradingPartnerDto {
  @IsString()
  @MaxLength(15)
  partnerId: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  idQualifier?: string;

  @IsString()
  @MaxLength(15)
  senderId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  senderQualifier?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedSets?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTradingPartnerDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  idQualifier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  senderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  senderQualifier?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedSets?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SendEdiDto {
  @IsUUID()
  tradingPartnerId: string;

  @IsString()
  transactionSet: string;

  @IsString()
  referenceId: string;
}

export class ListTransactionsQueryDto {
  @IsOptional()
  @IsUUID()
  tradingPartnerId?: string;

  @IsOptional()
  @IsString()
  transactionSet?: string;

  @IsOptional()
  @IsEnum(EdiDirection)
  direction?: EdiDirection;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  offset?: string;
}
