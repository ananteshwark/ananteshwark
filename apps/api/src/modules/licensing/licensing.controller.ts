import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LicensingService } from './licensing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreateLicensePlanDto,
  CreateLicenseContractDto,
  UpdateContractStatusDto,
  AssignModuleLicenseDto,
  UpdateModuleLicenseDto,
  AssignEmployeeModuleDto,
  BulkAssignEmployeeModuleDto,
  RecordConsumptionDto,
  GenerateInvoiceDto,
  UpdateInvoiceStatusDto,
  ValidateAccessDto,
  TakeSnapshotDto,
} from './dto/licensing.dto';

@ApiTags('licensing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('licensing')
export class LicensingController {
  constructor(private readonly licensingService: LicensingService) {}

  // ─── Dashboard ────────────────────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Get licensing dashboard' })
  @RequirePermission('licensing:read')
  getDashboard(@CurrentUser() user: any) {
    return this.licensingService.getDashboard(user.tenantId);
  }

  // ─── Module catalog ──────────────────────────────────────────────────────────

  @Get('catalog')
  @ApiOperation({ summary: 'List the licensable module catalog with licensed state' })
  @RequirePermission('licensing:read')
  getCatalog(@CurrentUser() user: any) {
    return this.licensingService.getCatalog(user.tenantId);
  }

  // ─── Plans ───────────────────────────────────────────────────────────────────

  @Get('plans')
  @ApiOperation({ summary: 'List license plans' })
  @RequirePermission('licensing:read')
  listPlans(@CurrentUser() user: any) {
    return this.licensingService.listPlans(user.tenantId);
  }

  @Post('plans')
  @ApiOperation({ summary: 'Create license plan' })
  @RequirePermission('licensing:manage')
  createPlan(@CurrentUser() user: any, @Body() dto: CreateLicensePlanDto) {
    return this.licensingService.createPlan(user.tenantId, dto);
  }

  // ─── Contracts ───────────────────────────────────────────────────────────────

  @Get('contracts')
  @ApiOperation({ summary: 'List contracts' })
  @RequirePermission('licensing:read')
  listContracts(@CurrentUser() user: any) {
    return this.licensingService.listContracts(user.tenantId);
  }

  @Post('contracts')
  @ApiOperation({ summary: 'Create contract' })
  @RequirePermission('licensing:manage')
  createContract(@CurrentUser() user: any, @Body() dto: CreateLicenseContractDto) {
    return this.licensingService.createContract(user.tenantId, dto, user.id);
  }

  @Get('contracts/:id')
  @ApiOperation({ summary: 'Get contract by ID' })
  @RequirePermission('licensing:read')
  getContract(@CurrentUser() user: any, @Param('id') id: string) {
    return this.licensingService.getContract(user.tenantId, id);
  }

  @Patch('contracts/:id/status')
  @ApiOperation({ summary: 'Update contract status' })
  @RequirePermission('licensing:manage')
  updateContractStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateContractStatusDto,
  ) {
    return this.licensingService.updateContractStatus(user.tenantId, id, dto, user.id);
  }

  // ─── Module Licenses ─────────────────────────────────────────────────────────

  @Get('module-licenses')
  @ApiOperation({ summary: 'List module licenses' })
  @RequirePermission('licensing:read')
  listModuleLicenses(@CurrentUser() user: any, @Query('contractId') contractId?: string) {
    return this.licensingService.listModuleLicenses(user.tenantId, contractId);
  }

  @Post('module-licenses')
  @ApiOperation({ summary: 'Assign module license' })
  @RequirePermission('licensing:manage')
  assignModuleLicense(@CurrentUser() user: any, @Body() dto: AssignModuleLicenseDto) {
    return this.licensingService.assignModuleLicense(user.tenantId, dto, user.id);
  }

  @Patch('module-licenses/:id')
  @ApiOperation({ summary: 'Update module license (licensed users, price, validity)' })
  @RequirePermission('licensing:manage')
  updateModuleLicense(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateModuleLicenseDto,
  ) {
    return this.licensingService.updateModuleLicense(user.tenantId, id, dto, user.id);
  }

  @Delete('module-licenses/:id')
  @ApiOperation({ summary: 'Revoke module license' })
  @RequirePermission('licensing:manage')
  revokeModuleLicense(@CurrentUser() user: any, @Param('id') id: string) {
    return this.licensingService.revokeModuleLicense(user.tenantId, id, user.id);
  }

  // ─── Employee Assignments ─────────────────────────────────────────────────────

  @Get('assignments')
  @ApiOperation({ summary: 'List employee assignments' })
  @RequirePermission('licensing:read')
  listAssignments(@CurrentUser() user: any, @Query('moduleKey') moduleKey?: string) {
    return this.licensingService.listAssignments(user.tenantId, moduleKey);
  }

  @Post('assignments')
  @ApiOperation({ summary: 'Assign employee to module' })
  @RequirePermission('licensing:manage')
  assignEmployee(@CurrentUser() user: any, @Body() dto: AssignEmployeeModuleDto) {
    return this.licensingService.assignEmployee(user.tenantId, dto, user.id);
  }

  @Post('assignments/bulk')
  @ApiOperation({ summary: 'Bulk assign employees to module' })
  @RequirePermission('licensing:manage')
  bulkAssignEmployees(@CurrentUser() user: any, @Body() dto: BulkAssignEmployeeModuleDto) {
    return this.licensingService.bulkAssignEmployees(user.tenantId, dto, user.id);
  }

  @Delete('assignments/:id')
  @ApiOperation({ summary: 'Revoke employee assignment' })
  @RequirePermission('licensing:manage')
  revokeAssignment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.licensingService.revokeAssignment(user.tenantId, id, user.id);
  }

  // ─── Invoices ─────────────────────────────────────────────────────────────────

  @Get('invoices')
  @ApiOperation({ summary: 'List invoices' })
  @RequirePermission('licensing:read')
  listInvoices(@CurrentUser() user: any, @Query('contractId') contractId?: string) {
    return this.licensingService.listInvoices(user.tenantId, contractId);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  @RequirePermission('licensing:read')
  getInvoice(@CurrentUser() user: any, @Param('id') id: string) {
    return this.licensingService.getInvoice(user.tenantId, id);
  }

  @Post('invoices/generate')
  @ApiOperation({ summary: 'Generate invoice' })
  @RequirePermission('licensing:manage')
  generateInvoice(@CurrentUser() user: any, @Body() dto: GenerateInvoiceDto) {
    return this.licensingService.generateInvoice(user.tenantId, dto, user.id);
  }

  @Patch('invoices/:id/status')
  @ApiOperation({ summary: 'Update invoice status' })
  @RequirePermission('licensing:manage')
  updateInvoiceStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    return this.licensingService.updateInvoiceStatus(user.tenantId, id, dto, user.id);
  }

  // ─── Consumption ──────────────────────────────────────────────────────────────

  @Get('consumption')
  @ApiOperation({ summary: 'Get consumption history' })
  @RequirePermission('licensing:read')
  getConsumptionHistory(
    @CurrentUser() user: any,
    @Query('periodMonth') periodMonth?: string,
    @Query('consumptionType') consumptionType?: string,
  ) {
    return this.licensingService.getConsumptionHistory(user.tenantId, {
      periodMonth,
      consumptionType,
    });
  }

  @Post('consumption')
  @ApiOperation({ summary: 'Record consumption' })
  @RequirePermission('licensing:manage')
  recordConsumption(@CurrentUser() user: any, @Body() dto: RecordConsumptionDto) {
    return this.licensingService.recordConsumption(user.tenantId, dto);
  }

  @Post('consumption/snapshot')
  @ApiOperation({ summary: 'Take usage snapshot' })
  @RequirePermission('licensing:manage')
  takeSnapshot(@CurrentUser() user: any, @Body() dto: TakeSnapshotDto) {
    return this.licensingService.takeSnapshot(user.tenantId, dto);
  }

  // ─── Billing cycle ────────────────────────────────────────────────────────────

  @Post('billing/run-cycle')
  @ApiOperation({ summary: 'Run the monthly billing cycle now (snapshot + invoice generation)' })
  @RequirePermission('licensing:manage')
  runBillingCycle(@Body() body: { asOf?: string }) {
    return this.licensingService.runMonthlyBillingCycle(
      body?.asOf ? new Date(body.asOf) : new Date(),
    );
  }

  // ─── License Validation ───────────────────────────────────────────────────────

  @Post('validate-access')
  @ApiOperation({ summary: 'Validate employee module access' })
  @RequirePermission('licensing:read')
  validateAccess(@CurrentUser() user: any, @Body() dto: ValidateAccessDto) {
    return this.licensingService.validateAccess(user.tenantId, dto);
  }
}
