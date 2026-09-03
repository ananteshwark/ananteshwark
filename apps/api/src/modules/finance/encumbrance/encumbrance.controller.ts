import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { EncumbranceService } from './encumbrance.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { EncumbranceType, EncumbranceStatus } from './entities/encumbrance.entity';

@ApiTags('finance-encumbrance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/encumbrance')
export class EncumbranceController {
  constructor(private readonly service: EncumbranceService) {}

  @Get()
  @RequirePermission('finance:budget:read')
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'sourceId', required: false })
  list(
    @CurrentUser() u: any,
    @Query('type') type?: EncumbranceType,
    @Query('status') status?: EncumbranceStatus,
    @Query('sourceId') sourceId?: string,
  ) {
    return this.service.list(u.tenantId, { type, status, sourceId });
  }

  @Post('funds-check')
  @RequirePermission('finance:budget:read')
  @ApiOperation({ summary: 'Funds availability check (budget − commitments − obligations − expenditures)' })
  fundsCheck(@CurrentUser() u: any, @Body() body: any) {
    return this.service.fundsCheck(u.tenantId, body);
  }

  @Post('commitments')
  @RequirePermission('finance:budget:manage')
  @ApiOperation({ summary: 'Record a commitment (PO/requisition); set enforceFunds to block over-budget' })
  createCommitment(@CurrentUser() u: any, @Body() body: any) {
    return this.service.createCommitment(u.tenantId, body);
  }

  @Post(':id/liquidate')
  @RequirePermission('finance:budget:manage')
  @ApiOperation({ summary: 'Liquidate an encumbrance, spawning the next lifecycle stage' })
  liquidate(@CurrentUser() u: any, @Param('id') id: string, @Body() body: any) {
    return this.service.liquidate(u.tenantId, id, body);
  }

  @Post('liquidate-by-source')
  @RequirePermission('finance:budget:manage')
  @ApiOperation({ summary: 'Liquidate all outstanding encumbrances for a source document' })
  liquidateBySource(@CurrentUser() u: any, @Body() body: { sourceType: string; sourceId: string; nextSourceType: string; nextSourceId: string }) {
    return this.service.liquidateBySource(u.tenantId, body.sourceType, body.sourceId, body.nextSourceType, body.nextSourceId);
  }

  @Get('reports/balance')
  @RequirePermission('finance:budget:read')
  @ApiOperation({ summary: 'Encumbrance balance report by account' })
  balanceReport(@CurrentUser() u: any, @Query('fiscalYear') fiscalYear: string) {
    return this.service.balanceReport(u.tenantId, Number(fiscalYear));
  }
}
