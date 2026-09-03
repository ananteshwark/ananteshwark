import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsDateString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateConsolidationGroupDto {
  @IsString()
  @MaxLength(50)
  code: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  reportingCurrency?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  memberEntityIds: string[];
}

export class UpdateConsolidationGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memberEntityIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class RunConsolidationDto {
  @IsUUID('4')
  groupId: string;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;
}
