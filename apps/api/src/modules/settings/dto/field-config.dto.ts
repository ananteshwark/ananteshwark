import { IsString, IsBoolean, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateFieldItemDto {
  @IsString() field: string;
  @IsBoolean() enabled: boolean;
  @IsBoolean() required: boolean;
  @IsOptional() @IsString() customLabel?: string;
}

export class UpdateModuleFieldConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateFieldItemDto)
  configs: UpdateFieldItemDto[];
}
