import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateWorkflowDefinitionDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  triggerModule: string;

  @ApiProperty()
  @IsString()
  triggerEvent: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  steps?: any[];
}

export class StartWorkflowDto {
  @ApiProperty()
  @IsString()
  definitionId: string;

  @ApiProperty()
  @IsString()
  subjectType: string;

  @ApiProperty()
  @IsString()
  subjectId: string;

  @ApiPropertyOptional()
  @IsOptional()
  context?: any;
}

export class ApproveStepDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}
