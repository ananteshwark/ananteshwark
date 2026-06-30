import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TerritoriesService } from './territories.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('crm-territories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('crm/territories')
export class TerritoriesController {
  constructor(private readonly service: TerritoriesService) {}

  // ─── Ph-217: territories ──────────────────────────────────────────
  @Get()
  @RequirePermission('crm:read')
  list(@CurrentUser() u: any) { return this.service.listTerritories(u.tenantId); }

  @Post()
  @RequirePermission('crm:manage')
  create(@CurrentUser() u: any, @Body() b: any) { return this.service.createTerritory(u.tenantId, b); }

  @Get('match')
  @RequirePermission('crm:read')
  @ApiOperation({ summary: 'Match an account to a territory by coverage rules' })
  @ApiQuery({ name: 'accountId', required: false })
  @ApiQuery({ name: 'region', required: false })
  @ApiQuery({ name: 'industry', required: false })
  match(@CurrentUser() u: any, @Query('accountId') accountId?: string, @Query('region') region?: string, @Query('industry') industry?: string) {
    return this.service.matchTerritory(u.tenantId, { accountId, region, industry });
  }

  // ─── Ph-218: quotas ───────────────────────────────────────────────
  @Post('quotas')
  @RequirePermission('crm:manage')
  @ApiOperation({ summary: 'Set a rep/territory/product/quarter quota' })
  setQuota(@CurrentUser() u: any, @Body() b: any) { return this.service.setQuota(u.tenantId, b); }

  @Get('quotas')
  @RequirePermission('crm:read')
  @ApiQuery({ name: 'period', required: true })
  listQuotas(@CurrentUser() u: any, @Query('period') period: string) { return this.service.listQuotas(u.tenantId, period); }

  // ─── Ph-219: attainment ───────────────────────────────────────────
  @Get('attainment')
  @RequirePermission('crm:read')
  @ApiOperation({ summary: 'Quota attainment by rep for a period' })
  @ApiQuery({ name: 'period', required: true })
  @ApiQuery({ name: 'repId', required: false })
  attainment(@CurrentUser() u: any, @Query('period') period: string, @Query('repId') repId?: string) {
    return this.service.attainment(u.tenantId, period, repId);
  }
}
