import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsInt,
  MaxLength,
  Min,
} from 'class-validator';
import { CustomFieldType, CustomFieldEntityType } from '../entities/custom-field-definition.entity';

export class CreateCustomFieldDefinitionDto {
  @IsEnum(CustomFieldEntityType)
  entityType: CustomFieldEntityType;

  @IsString()
  @MaxLength(100)
  fieldKey: string;

  @IsString()
  @MaxLength(200)
  fieldLabel: string;

  @IsEnum(CustomFieldType)
  fieldType: CustomFieldType;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  showInList?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsString()
  defaultValue?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCustomFieldDefinitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fieldLabel?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  showInList?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsString()
  defaultValue?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class SetCustomFieldValueDto {
  @IsString()
  fieldDefinitionId: string;

  @IsOptional()
  @IsString()
  value?: string | null;
}

export class BulkSetCustomFieldValuesDto {
  @IsArray()
  values: SetCustomFieldValueDto[];
}
