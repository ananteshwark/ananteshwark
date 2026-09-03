import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Criticality } from '../entities/succession-plan.entity';
import { ReadinessLevel } from '../entities/successor-candidate.entity';

export class CreateSuccessionPlanDto {
  @ApiProperty() @IsString() positionTitle: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currentHolderId?: string;
  @ApiPropertyOptional({ enum: Criticality }) @IsOptional() @IsEnum(Criticality) criticality?: Criticality;
}

export class AddCandidateDto {
  @ApiProperty() @IsString() planId: string;
  @ApiProperty() @IsString() employeeId: string;
  @ApiPropertyOptional({ enum: ReadinessLevel }) @IsOptional() @IsEnum(ReadinessLevel) readinessLevel?: ReadinessLevel;
  @ApiPropertyOptional() @IsOptional() @IsString() developmentActions?: string;
}
