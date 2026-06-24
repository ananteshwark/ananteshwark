import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Res,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RunService } from './run.service';
import { BankFileService } from './bank-file.service';
import { BankFileFormat } from './entities/bank-file-run.entity';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreatePayrollRunDto } from './dto/run.dto';
import { renderPayslipPrint } from './payslip-print.template';

@ApiTags('payroll-runs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('payroll')
export class RunController {
  constructor(
    private readonly service: RunService,
    private readonly bankFileService: BankFileService,
  ) {}

  // Runs
  @Get('runs')
  @RequirePermission('payroll:runs:read')
  listRuns(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
  ) {
    return this.service.listRuns(user.tenantId, pagination, { status });
  }

  @Get('runs/:id')
  @RequirePermission('payroll:runs:read')
  getRun(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getRunWithPayslips(user.tenantId, id);
  }

  @Post('runs')
  @RequirePermission('payroll:runs:process')
  createRun(@CurrentUser() user: any, @Body() dto: CreatePayrollRunDto) {
    return this.service.createRun(user.tenantId, dto);
  }

  @Post('runs/:id/process')
  @RequirePermission('payroll:runs:process')
  processRun(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.processRun(user.tenantId, id, user.id);
  }

  @Post('runs/:id/approve')
  @RequirePermission('payroll:runs:approve')
  approveRun(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approveRun(user.tenantId, id, user.id);
  }

  @Post('runs/:id/mark-paid')
  @RequirePermission('payroll:runs:approve')
  markPaid(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.markPaid(user.tenantId, id, user.id);
  }

  @Post('runs/:id/cancel')
  @RequirePermission('payroll:runs:process')
  cancelRun(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancelRun(user.tenantId, id);
  }

  // ─── Phase 81: Bank File Export ─────────────────────────────────────────

  @Get('runs/:id/bank-files')
  @RequirePermission('payroll:runs:approve')
  @ApiOperation({ summary: 'List all generated bank file runs for a payroll run' })
  listBankFileRuns(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bankFileService.listBankFileRuns(user.tenantId, id);
  }

  @Post('runs/:id/bank-files')
  @RequirePermission('payroll:runs:approve')
  @ApiOperation({ summary: 'Generate a bank file (NEFT_RTGS | NACHA_ACH | WPS_SIF | SEPA_XML)' })
  generateBankFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { format: BankFileFormat; options?: Record<string, string> },
  ) {
    return this.bankFileService.generateAndSave(
      user.tenantId, id, body.format, body.options ?? {}, user.id,
    );
  }

  @Get('runs/:id/bank-files/:fileId/download')
  @RequirePermission('payroll:runs:approve')
  @ApiOperation({ summary: 'Download raw bank file content' })
  async downloadBankFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const files = await this.bankFileService.listBankFileRuns(user.tenantId, id);
    const file = files.find(f => f.id === fileId);
    if (!file) { res.status(404).send('Not found'); return; }
    const ext = file.format === BankFileFormat.SEPA_XML ? 'xml' : 'txt';
    const ct  = file.format === BankFileFormat.SEPA_XML ? 'application/xml' : 'text/plain';
    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', `attachment; filename="bank-file-${file.format}-${id.slice(0, 8)}.${ext}"`);
    res.send(file.content);
  }

  @Post('runs/:id/mark-payslips-paid')
  @RequirePermission('payroll:runs:approve')
  @ApiOperation({ summary: 'Mark all payslips in this run as PAID' })
  markPayslipsPaid(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bankFileService.markPayslipsPaid(user.tenantId, id);
  }

  // Legacy CSV endpoint (kept for backwards compatibility)
  @Get('runs/:id/bank-file')
  @RequirePermission('payroll:runs:approve')
  @Header('Content-Type', 'text/csv')
  async downloadBankFileLegacy(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const csv = await this.service.generateBankFile(user.tenantId, id);
    res.setHeader('Content-Disposition', `attachment; filename="bank-file-${id.slice(0, 8)}.csv"`);
    res.send(csv);
  }

  // Payslips
  @Get('payslips')
  @RequirePermission('payroll:payslips:read')
  listPayslips(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('payrollRunId') payrollRunId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.service.listPayslips(user.tenantId, pagination, {
      payrollRunId,
      employeeId,
    });
  }

  @Get('payslips/:id')
  @RequirePermission('payroll:payslips:read')
  getPayslip(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getPayslip(user.tenantId, id);
  }

  @Get('payslips/:id/print')
  @RequirePermission('payroll:payslips:read')
  async printPayslip(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const payslip = await this.service.getPayslip(user.tenantId, id);
    const html = renderPayslipPrint({
      payslip: payslip as any,
      companyName: user.tenantName || 'Company',
    });
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  }

  @Get('employees/:employeeId/payslips')
  @RequirePermission('payroll:payslips:read')
  getEmployeePayslips(
    @CurrentUser() user: any,
    @Param('employeeId') employeeId: string,
  ) {
    return this.service.getEmployeePayslips(user.tenantId, employeeId);
  }
}
