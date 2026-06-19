import { IsString, IsOptional, IsEnum, IsNumber, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CycleStatus } from '../entities/okr-cycle.entity';
import { OwnerType } from '../entities/objective.entity';

export class CreateCycleDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() startDate: string;
  @ApiProperty() @IsString() endDate: string;
  @ApiPropertyOptional({ enum: CycleStatus }) @IsOptional() @IsEnum(CycleStatus) status?: CycleStatus;
}

export class CreateObjectiveDto {
  @ApiProperty() @IsString() cycleId: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() ownerId: string;
  @ApiPropertyOptional({ enum: OwnerType }) @IsOptional() @IsEnum(OwnerType) ownerType?: OwnerType;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() parentObjectiveId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() weight?: number;
}

export class CreateKeyResultDto {
  @ApiProperty() @IsString() objectiveId: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() metric?: string;
  @ApiProperty() @IsNumber() targetValue: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() currentValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dueDate?: string;
}

export class UpdateKrProgressDto {
  @ApiProperty() @IsNumber() currentValue: number;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}
