import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StatutoryService } from './statutory.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  UpsertStatutoryConfigDto,
  CreateComplianceItemDto,
} from './dto/statutory.dto';

@ApiTags('payroll-statutory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('payroll/statutory')
export class StatutoryController {
  constructor(private readonly service: StatutoryService) {}

  // Config
  @Get('configs')
  @RequirePermission('payroll:statutory:read')
  getConfigs(@CurrentUser() user: any) {
    return this.service.getStatutoryConfigs(user.tenantId);
  }

  @Post('configs')
  @RequirePermission('payroll:statutory:manage')
  upsertConfig(@CurrentUser() user: any, @Body() dto: UpsertStatutoryConfigDto) {
    return this.service.upsertStatutoryConfig(user.tenantId, dto);
  }

  // Tax slabs
  @Get('tax-slabs')
  @RequirePermission('payroll:statutory:read')
  listTaxSlabs(@CurrentUser() user: any) {
    return this.service.listTaxSlabs(user.tenantId);
  }

  // Compliance calendar
  @Get('calendar')
  @RequirePermission('payroll:statutory:read')
  getCalendar(
    @CurrentUser() user: any,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.service.getComplianceCalendar(
      user.tenantId,
      month ? parseInt(month, 10) : undefined,
      year ? parseInt(year, 10) : undefined,
    );
  }

  @Post('calendar')
  @RequirePermission('payroll:statutory:manage')
  createCalendarItem(
    @CurrentUser() user: any,
    @Body() dto: CreateComplianceItemDto,
  ) {
    return this.service.createComplianceItem(user.tenantId, dto);
  }

  @Post('calendar/generate')
  @RequirePermission('payroll:statutory:manage')
  generateCalendar(
    @CurrentUser() user: any,
    @Body() body: { month: number; year: number },
  ) {
    return this.service.generateMonthlyComplianceItems(
      user.tenantId,
      body.month,
      body.year,
    );
  }

  @Post('calendar/:id/file')
  @RequirePermission('payroll:statutory:manage')
  markFiled(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { remarks?: string },
  ) {
    return this.service.markFiled(user.tenantId, id, body?.remarks);
  }

  // Form 16
  @Get('form16')
  @RequirePermission('payroll:statutory:read')
  listForm16(@CurrentUser() user: any, @Query('employeeId') employeeId?: string) {
    return this.service.listForm16(user.tenantId, employeeId);
  }

  @Post('form16/generate')
  @RequirePermission('payroll:statutory:manage')
  generateForm16(@CurrentUser() user: any, @Body() body: { employeeId: string; financialYear: string; grossSalary: number; totalDeductions: number; taxableIncome: number; taxPaid: number }) {
    return this.service.generateForm16(user.tenantId, body.employeeId, body.financialYear, body);
  }

  // 24Q TDS Returns
  @Get('tds-returns')
  @RequirePermission('payroll:statutory:read')
  list24QReturns(@CurrentUser() user: any, @Query('financialYear') financialYear?: string) {
    return this.service.list24QReturns(user.tenantId, financialYear);
  }

  @Post('tds-returns')
  @RequirePermission('payroll:statutory:manage')
  create24QReturn(@CurrentUser() user: any, @Body() body: any) {
    return this.service.create24QReturn(user.tenantId, body);
  }

  @Post('tds-returns/:id/file')
  @RequirePermission('payroll:statutory:manage')
  file24QReturn(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { acknowledgementNumber?: string }) {
    return this.service.file24QReturn(user.tenantId, id, body?.acknowledgementNumber);
  }

  // Gratuity settlements
  @Get('gratuity')
  @RequirePermission('payroll:statutory:read')
  listGratuity(@CurrentUser() user: any, @Query('employeeId') employeeId?: string) {
    return this.service.listGratuitySettlements(user.tenantId, employeeId);
  }

  @Post('gratuity')
  @RequirePermission('payroll:statutory:manage')
  createGratuity(@CurrentUser() user: any, @Body() body: any) {
    return this.service.createGratuitySettlement(user.tenantId, body);
  }

  @Post('gratuity/:id/approve')
  @RequirePermission('payroll:statutory:manage')
  approveGratuity(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approveGratuitySettlement(user.tenantId, id, user.id);
  }

  @Post('gratuity/:id/pay')
  @RequirePermission('payroll:statutory:manage')
  markGratuityPaid(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.markGratuityPaid(user.tenantId, id);
  }

  // Gratuity calculation helper
  @Post('gratuity/calculate')
  @RequirePermission('payroll:statutory:read')
  calculateGratuity(@Body() body: { lastDrawnBasic: number; yearsOfService: number }) {
    const amount = this.service.calculateGratuity(body.lastDrawnBasic, body.yearsOfService);
    return { amount, eligible: body.yearsOfService >= 5 };
  }
}
