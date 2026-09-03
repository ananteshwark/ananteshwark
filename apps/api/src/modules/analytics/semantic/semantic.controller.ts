import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SemanticService, SemanticQuery } from './semantic.service';

@ApiTags('analytics-semantic')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('analytics/queries')
export class SemanticController {
  constructor(private readonly service: SemanticService) {}

  @Get('datasets')
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Queryable datasets with their dimensions and measures' })
  datasets() {
    return this.service.listDatasets();
  }

  @Post('run')
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Run an ad-hoc semantic query (whitelisted fields only)' })
  run(@CurrentUser() user: any, @Body() query: SemanticQuery) {
    return this.service.run(user.tenantId, query);
  }

  @Get('saved')
  @RequirePermission('analytics:read')
  listSaved(@CurrentUser() user: any) {
    return this.service.listSaved(user.tenantId);
  }

  @Post('saved')
  @RequirePermission('analytics:manage')
  save(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.saveQuery(user.tenantId, user.id, dto);
  }

  @Get('saved/:id/run')
  @RequirePermission('analytics:read')
  runSaved(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.runSaved(user.tenantId, id);
  }

  @Delete('saved/:id')
  @RequirePermission('analytics:manage')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteSaved(user.tenantId, id);
  }
}
