import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  IsEmail,
  IsBoolean,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LicenseType } from '../entities/license-plan.entity';
import { ContractStatus, BillingCycle } from '../entities/license-contract.entity';
import { ConsumptionType } from '../entities/consumption-record.entity';
import { InvoiceStatus } from '../entities/license-invoice.entity';

export class PricingTierDto {
  @IsString()
  tierName: string;

  @IsInt()
  @Min(0)
  minUnits: number;

  @IsOptional()
  @IsInt()
  maxUnits?: number;

  @IsNumber()
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  flatFee?: number;
}

export class CreateLicensePlanDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(LicenseType)
  licenseType: LicenseType;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingTierDto)
  tiers?: PricingTierDto[];
}

export class CreateLicenseContractDto {
  @IsOptional()
  @IsString()
  planId?: string;

  @IsEnum(LicenseType)
  licenseType: LicenseType;

  @IsEnum(BillingCycle)
  billingCycle: BillingCycle;

  @IsString()
  contractStartDate: string;

  @IsString()
  contractEndDate: string;

  @IsOptional()
  @IsInt()
  minCommitmentEmployees?: number;

  @IsOptional()
  @IsNumber()
  committedAmount?: number;

  @IsOptional()
  @IsNumber()
  consumptionPoolUnits?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsInt()
  gracePeriodDays?: number;

  @IsOptional()
  @IsNumber()
  graceThresholdPct?: number;

  @IsOptional()
  @IsEmail()
  billingContactEmail?: string;
}

export class UpdateContractStatusDto {
  @IsEnum(ContractStatus)
  status: ContractStatus;
}

export class AssignModuleLicenseDto {
  @IsString()
  contractId: string;

  @IsString()
  moduleKey: string;

  @IsString()
  moduleName: string;

  @IsOptional()
  @IsInt()
  maxEmployees?: number;

  @IsNumber()
  unitPrice: number;

  @IsString()
  effectiveFrom: string;

  @IsOptional()
  @IsString()
  effectiveTo?: string;
}

export class AssignEmployeeModuleDto {
  @IsString()
  employeeId: string;

  @IsString()
  employeeName: string;

  @IsString()
  moduleKey: string;
}

export class BulkEmployeeEntry {
  @IsString()
  employeeId: string;

  @IsString()
  employeeName: string;
}

export class BulkAssignEmployeeModuleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkEmployeeEntry)
  employeeIds: BulkEmployeeEntry[];

  @IsString()
  moduleKey: string;
}

export class RecordConsumptionDto {
  @IsString()
  periodMonth: string;

  @IsEnum(ConsumptionType)
  consumptionType: ConsumptionType;

  @IsOptional()
  @IsString()
  moduleKey?: string;

  @IsInt()
  activeEmployees: number;

  @IsNumber()
  unitsConsumed: number;

  @IsNumber()
  unitRate: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class GenerateInvoiceDto {
  @IsString()
  contractId: string;

  @IsString()
  periodStart: string;

  @IsString()
  periodEnd: string;

  @IsOptional()
  @IsNumber()
  taxRate?: number;
}

export class UpdateInvoiceStatusDto {
  @IsEnum(InvoiceStatus)
  status: InvoiceStatus;
}

export class ValidateAccessDto {
  @IsString()
  employeeId: string;

  @IsString()
  moduleKey: string;
}

export class TakeSnapshotDto {
  @IsString()
  snapshotMonth: string;
}
