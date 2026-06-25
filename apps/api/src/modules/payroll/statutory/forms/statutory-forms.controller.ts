import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StatutoryFormsService } from './statutory-forms.service';
import { renderW2Print } from './w2-print.template';
import { StatutoryFormType } from './entities/statutory-form.entity';
import { EmailService } from '../../../email/email.service';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';

@ApiTags('payroll-statutory-forms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('payroll/statutory/forms')
export class StatutoryFormsController {
  constructor(
    private readonly service: StatutoryFormsService,
    private readonly emailService: EmailService,
  ) {}

  // ─── Listing ───────────────────────────────────────────────────────────────

  @Get()
  @RequirePermission('payroll:statutory:read')
  list(
    @CurrentUser() user: any,
    @Query('formType') formType?: StatutoryFormType,
    @Query('taxYear') taxYear?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.service.listForms(user.tenantId, {
      formType,
      taxYear: taxYear ? parseInt(taxYear, 10) : undefined,
      employeeId,
    });
  }

  @Get(':id')
  @RequirePermission('payroll:statutory:read')
  get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getForm(user.tenantId, id);
  }

  @Post(':id/file')
  @RequirePermission('payroll:statutory:manage')
  fileForm(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.fileForm(user.tenantId, id);
  }

  // ─── US: W-2 ────────────────────────────────────────────────────────────────

  @Post('w2')
  @RequirePermission('payroll:statutory:manage')
  @ApiOperation({ summary: 'Generate a W-2 for one employee for a tax year' })
  generateW2(
    @CurrentUser() user: any,
    @Body() body: { employeeId: string; taxYear: number; options?: any },
  ) {
    return this.service.generateW2(
      user.tenantId, body.employeeId, body.taxYear, body.options ?? {}, user.id,
    );
  }

  @Post('w2/batch')
  @RequirePermission('payroll:statutory:manage')
  @ApiOperation({ summary: 'Generate W-2s for all employees with earnings in a tax year' })
  generateW2Batch(
    @CurrentUser() user: any,
    @Body() body: { taxYear: number; options?: any },
  ) {
    return this.service.generateW2Batch(user.tenantId, body.taxYear, body.options ?? {}, user.id);
  }

  @Get(':id/w2/print')
  @RequirePermission('payroll:statutory:read')
  async printW2(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const form = await this.service.getForm(user.tenantId, id);
    const html = renderW2Print({
      taxYear: form.taxYear,
      recipientName: form.recipientName ?? '',
      data: form.data ?? {},
      companyName: user.tenantName || 'Company',
    });
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  }

  @Post(':id/email')
  @RequirePermission('payroll:statutory:manage')
  @ApiOperation({ summary: 'Email a statutory form notification to a recipient' })
  async emailForm(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { to: string },
  ) {
    const form = await this.service.getForm(user.tenantId, id);
    const result = await this.emailService.sendEmail(user.tenantId, body.to, 'STATUTORY_FORM_READY', {
      employeeName: form.recipientName ?? '',
      formType: form.formType,
      taxYear: form.taxYear,
      companyName: user.tenantName || 'Company',
    });
    return result;
  }

  // ─── US: 1099-NEC ───────────────────────────────────────────────────────────

  @Post('1099-nec')
  @RequirePermission('payroll:statutory:manage')
  @ApiOperation({ summary: 'Generate a 1099-NEC for a contractor' })
  generate1099(
    @CurrentUser() user: any,
    @Body() body: { taxYear: number; options: any },
  ) {
    return this.service.generate1099Nec(user.tenantId, body.taxYear, body.options ?? {}, user.id);
  }

  // ─── US: W-3 + SSA EFW2 ─────────────────────────────────────────────────────

  @Post('w3')
  @RequirePermission('payroll:statutory:manage')
  @ApiOperation({ summary: 'Generate the W-3 employer transmittal summary' })
  generateW3(
    @CurrentUser() user: any,
    @Body() body: { taxYear: number; options?: any },
  ) {
    return this.service.generateW3(user.tenantId, body.taxYear, body.options ?? {}, user.id);
  }

  @Post('efw2')
  @RequirePermission('payroll:statutory:manage')
  @ApiOperation({ summary: 'Generate the SSA EFW2 electronic submission file' })
  generateEfw2(
    @CurrentUser() user: any,
    @Body() body: { taxYear: number; options?: any },
  ) {
    return this.service.generateEfw2(user.tenantId, body.taxYear, body.options ?? {}, user.id);
  }

  @Get(':id/download')
  @RequirePermission('payroll:statutory:read')
  @ApiOperation({ summary: 'Download a form machine file (EFW2)' })
  async download(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
    const form = await this.service.getForm(user.tenantId, id);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${form.formType}-${form.taxYear}.txt"`,
    );
    res.send(form.content ?? '');
  }

  // ─── UAE: WPS SIF validation ────────────────────────────────────────────────

  @Post('wps/validate')
  @RequirePermission('payroll:statutory:read')
  @ApiOperation({ summary: 'Validate a WPS SIF file against UAE MoHRE rules' })
  validateWps(@Body() body: { content: string }) {
    return this.service.validateWpsSif(body?.content ?? '');
  }

  // ─── UAE: EOSB ──────────────────────────────────────────────────────────────

  @Get('eosb/list')
  @RequirePermission('payroll:statutory:read')
  listEosb(@CurrentUser() user: any, @Query('employeeId') employeeId?: string) {
    return this.service.listEosbSettlements(user.tenantId, employeeId);
  }

  @Post('eosb/calculate')
  @RequirePermission('payroll:statutory:read')
  calculateEosb(@Body() body: { lastDrawnBasic: number; yearsOfService: number }) {
    const amount = this.service.calculateEosb(body.lastDrawnBasic, body.yearsOfService);
    return { amount, eligible: body.yearsOfService >= 1 };
  }

  @Post('eosb')
  @RequirePermission('payroll:statutory:manage')
  createEosb(@CurrentUser() user: any, @Body() body: any) {
    return this.service.createEosbSettlement(user.tenantId, body);
  }

  @Post('eosb/:id/approve')
  @RequirePermission('payroll:statutory:manage')
  approveEosb(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approveEosbSettlement(user.tenantId, id, user.id);
  }

  @Post('eosb/:id/reject')
  @RequirePermission('payroll:statutory:manage')
  rejectEosb(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { remarks?: string }) {
    return this.service.rejectEosbSettlement(user.tenantId, id, body?.remarks);
  }

  @Post('eosb/:id/pay')
  @RequirePermission('payroll:statutory:manage')
  payEosb(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.markEosbPaid(user.tenantId, id);
  }
}
