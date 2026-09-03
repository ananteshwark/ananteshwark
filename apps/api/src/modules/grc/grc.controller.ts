import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GrcService } from './grc.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('grc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('grc')
export class GrcController {
  constructor(private readonly service: GrcService) {}

  // ─── Ph-285/286: SOD ──────────────────────────────────────────────
  @Get('sod-rules')
  @RequirePermission('admin:read')
  listSodRules(@CurrentUser() u: any) { return this.service.listSodRules(u.tenantId); }

  @Post('sod-rules')
  @RequirePermission('admin:manage')
  createSodRule(@CurrentUser() u: any, @Body() b: any) { return this.service.createSodRule(u.tenantId, b); }

  @Patch('sod-rules/:id')
  @RequirePermission('admin:manage')
  updateSodRule(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.updateSodRule(u.tenantId, id, b); }

  @Post('sod-scan')
  @RequirePermission('admin:read')
  @ApiOperation({ summary: 'Detect SOD violations across user permission sets' })
  detect(@CurrentUser() u: any, @Body() b: { assignments: any[] }) { return this.service.detectViolations(u.tenantId, b.assignments ?? []); }

  // ─── Ph-287: controls ─────────────────────────────────────────────
  @Get('controls')
  @RequirePermission('admin:read')
  listControls(@CurrentUser() u: any) { return this.service.listControls(u.tenantId); }

  @Post('controls')
  @RequirePermission('admin:manage')
  createControl(@CurrentUser() u: any, @Body() b: any) { return this.service.createControl(u.tenantId, b); }

  @Patch('controls/:id')
  @RequirePermission('admin:manage')
  updateControl(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.updateControl(u.tenantId, id, b); }

  @Post('controls/:id/test')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Record a control test (effective/deficient)' })
  recordTest(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.recordTest(u.tenantId, id, b); }

  // ─── Ph-288: risk register ────────────────────────────────────────
  @Get('risks')
  @RequirePermission('admin:read')
  listRisks(@CurrentUser() u: any) { return this.service.listRisks(u.tenantId); }

  @Post('risks')
  @RequirePermission('admin:manage')
  createRisk(@CurrentUser() u: any, @Body() b: any) { return this.service.createRisk(u.tenantId, b); }

  @Patch('risks/:id')
  @RequirePermission('admin:manage')
  updateRisk(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.updateRisk(u.tenantId, id, b); }

  @Get('risks/heat-map')
  @RequirePermission('admin:read')
  @ApiOperation({ summary: '5×5 likelihood×impact risk heat map' })
  heatMap(@CurrentUser() u: any) { return this.service.heatMap(u.tenantId); }
}
