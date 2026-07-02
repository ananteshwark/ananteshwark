import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SupplierQualificationService } from './supplier-qualification.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ResponseStatus } from './entities/questionnaire-response.entity';

@ApiTags('supplier-qualification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/supplier-qualification')
export class SupplierQualificationController {
  constructor(private readonly service: SupplierQualificationService) {}

  // ─── Ph-202: questionnaires ───────────────────────────────────────
  @Get('questionnaires')
  @RequirePermission('procurement:read')
  @ApiQuery({ name: 'category', required: false })
  listQuestionnaires(@CurrentUser() u: any, @Query('category') category?: string) { return this.service.listQuestionnaires(u.tenantId, category); }

  @Post('questionnaires')
  @RequirePermission('procurement:manage')
  createQuestionnaire(@CurrentUser() u: any, @Body() b: any) { return this.service.createQuestionnaire(u.tenantId, b); }

  @Patch('questionnaires/:id')
  @RequirePermission('procurement:manage')
  updateQuestionnaire(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.updateQuestionnaire(u.tenantId, id, b); }

  // ─── Ph-203: responses ────────────────────────────────────────────
  @Post('responses')
  @RequirePermission('procurement:manage')
  @ApiOperation({ summary: 'Submit supplier answers; auto-scored pass/review' })
  submitResponse(@CurrentUser() u: any, @Body() b: any) { return this.service.submitResponse(u.tenantId, b); }

  @Get('responses')
  @RequirePermission('procurement:read')
  @ApiQuery({ name: 'questionnaireId', required: false })
  @ApiQuery({ name: 'supplierId', required: false })
  @ApiQuery({ name: 'status', required: false })
  listResponses(@CurrentUser() u: any, @Query('questionnaireId') questionnaireId?: string, @Query('supplierId') supplierId?: string, @Query('status') status?: ResponseStatus) {
    return this.service.listResponses(u.tenantId, { questionnaireId, supplierId, status });
  }

  @Post('responses/:id/review')
  @RequirePermission('procurement:manage')
  @ApiOperation({ summary: 'Approve/reject a response in review' })
  review(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { decision: 'APPROVE' | 'REJECT'; notes?: string }) {
    return this.service.reviewResponse(u.tenantId, id, u.id, b.decision, b.notes);
  }

  // ─── Ph-204: certificates ─────────────────────────────────────────
  @Post('certificates')
  @RequirePermission('procurement:manage')
  addCertificate(@CurrentUser() u: any, @Body() b: any) { return this.service.addCertificate(u.tenantId, b); }

  @Get('certificates')
  @RequirePermission('procurement:read')
  @ApiQuery({ name: 'supplierId', required: true })
  @ApiQuery({ name: 'asOf', required: true })
  listCertificates(@CurrentUser() u: any, @Query('supplierId') supplierId: string, @Query('asOf') asOf: string) {
    return this.service.listCertificates(u.tenantId, supplierId, asOf);
  }

  @Get('certificates/expiring')
  @RequirePermission('procurement:read')
  @ApiOperation({ summary: 'Certificates expiring within N days (or expired)' })
  @ApiQuery({ name: 'asOf', required: true })
  @ApiQuery({ name: 'withinDays', required: false })
  expiring(@CurrentUser() u: any, @Query('asOf') asOf: string, @Query('withinDays') withinDays?: string) {
    return this.service.expiringCertificates(u.tenantId, asOf, withinDays ? Number(withinDays) : 30);
  }

  // ─── Ph-205: scorecard ────────────────────────────────────────────
  @Post('scorecards')
  @RequirePermission('procurement:manage')
  @ApiOperation({ summary: 'Upsert a periodic supplier KPI scorecard' })
  upsertScorecard(@CurrentUser() u: any, @Body() b: any) { return this.service.upsertScorecard(u.tenantId, b); }

  @Get('scorecards/trend')
  @RequirePermission('procurement:read')
  @ApiQuery({ name: 'supplierId', required: true })
  trend(@CurrentUser() u: any, @Query('supplierId') supplierId: string) { return this.service.scorecardTrend(u.tenantId, supplierId); }
}
