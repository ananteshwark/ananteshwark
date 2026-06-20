import { IsString, IsOptional, IsNumber, IsDateString, IsArray, ValidateNested, IsBoolean, IsEnum, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EquipmentStatus } from '../entities/equipment.entity';
import { MaintenancePlanType } from '../entities/maintenance-plan.entity';
import { MaintenanceOrderType, MaintenanceOrderPriority } from '../entities/maintenance-order.entity';
import { BreakdownSeverity } from '../entities/breakdown-notification.entity';

export class CreateEquipmentDto {
  @ApiProperty() @IsString() equipmentCode: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() manufacturer?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() installationDate?: string;
  @ApiPropertyOptional({ enum: EquipmentStatus }) @IsOptional() @IsEnum(EquipmentStatus) status?: EquipmentStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateEquipmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional({ enum: EquipmentStatus }) @IsOptional() @IsEnum(EquipmentStatus) status?: EquipmentStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class MaintenanceTaskDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsNumber() estimatedHours: number;
}

export class CreateMaintenancePlanDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsUUID() equipmentId: string;
  @ApiProperty({ enum: MaintenancePlanType }) @IsEnum(MaintenancePlanType) planType: MaintenancePlanType;
  @ApiPropertyOptional() @IsOptional() @IsNumber() frequencyDays?: number;
  @ApiProperty({ type: [MaintenanceTaskDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => MaintenanceTaskDto) tasks: MaintenanceTaskDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() nextDueDate?: string;
}

export class CreateMaintenanceOrderDto {
  @ApiProperty() @IsUUID() equipmentId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() planId?: string;
  @ApiProperty({ enum: MaintenanceOrderType }) @IsEnum(MaintenanceOrderType) type: MaintenanceOrderType;
  @ApiPropertyOptional({ enum: MaintenanceOrderPriority }) @IsOptional() @IsEnum(MaintenanceOrderPriority) priority?: MaintenanceOrderPriority;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assignedToId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() plannedStartDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() plannedEndDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CompleteMaintenanceOrderDto {
  @ApiProperty() @IsDateString() actualEndDate: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() laborHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateBreakdownNotificationDto {
  @ApiProperty() @IsUUID() equipmentId: string;
  @ApiProperty() @IsString() description: string;
  @ApiProperty({ enum: BreakdownSeverity }) @IsEnum(BreakdownSeverity) severity: BreakdownSeverity;
}
