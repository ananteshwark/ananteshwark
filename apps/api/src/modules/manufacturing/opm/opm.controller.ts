import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OpmService } from './opm.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { BatchStatus } from './entities/batch.entity';

@ApiTags('manufacturing-opm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('manufacturing/opm')
export class OpmController {
  constructor(private readonly service: OpmService) {}

  // ─── Ph-159: formulas ─────────────────────────────────────────────
  @Get('formulas')
  @RequirePermission('manufacturing:read')
  listFormulas(@CurrentUser() u: any) { return this.service.listFormulas(u.tenantId); }

  @Get('formulas/:id')
  @RequirePermission('manufacturing:read')
  getFormula(@CurrentUser() u: any, @Param('id') id: string) { return this.service.getFormula(u.tenantId, id); }

  @Post('formulas')
  @RequirePermission('manufacturing:manage')
  @ApiOperation({ summary: 'Create a formula / recipe' })
  createFormula(@CurrentUser() u: any, @Body() b: any) { return this.service.createFormula(u.tenantId, b); }

  @Post('formulas/:id/details')
  @RequirePermission('manufacturing:manage')
  @ApiOperation({ summary: 'Add an ingredient / co-product / by-product line' })
  addDetail(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.addDetail(u.tenantId, id, b); }

  @Post('formulas/:id/approve')
  @RequirePermission('manufacturing:manage')
  approveFormula(@CurrentUser() u: any, @Param('id') id: string) { return this.service.approveFormula(u.tenantId, id); }

  // ─── Ph-160/161: batches ──────────────────────────────────────────
  @Get('batches')
  @RequirePermission('manufacturing:read')
  @ApiQuery({ name: 'status', required: false })
  listBatches(@CurrentUser() u: any, @Query('status') status?: BatchStatus) { return this.service.listBatches(u.tenantId, status); }

  @Get('batches/:id')
  @RequirePermission('manufacturing:read')
  getBatch(@CurrentUser() u: any, @Param('id') id: string) { return this.service.getBatch(u.tenantId, id); }

  @Post('batches')
  @RequirePermission('manufacturing:manage')
  @ApiOperation({ summary: 'Create a quantity-scaled batch from a formula' })
  createBatch(@CurrentUser() u: any, @Body() b: any) { return this.service.createBatch(u.tenantId, b); }

  @Post('batches/:id/operations')
  @RequirePermission('manufacturing:manage')
  setOperations(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { operations: any[] }) { return this.service.setOperations(u.tenantId, id, b.operations); }

  @Post('batches/:id/start')
  @RequirePermission('manufacturing:manage')
  startBatch(@CurrentUser() u: any, @Param('id') id: string) { return this.service.startBatch(u.tenantId, id); }

  @Post('batches/:id/complete')
  @RequirePermission('manufacturing:manage')
  completeBatch(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.completeBatch(u.tenantId, id, b); }

  // ─── Ph-162: lab release ──────────────────────────────────────────
  @Post('batches/:id/lab-result')
  @RequirePermission('manufacturing:manage')
  @ApiOperation({ summary: 'Record lab result; PASS releases batch to stock, FAIL rejects' })
  labResult(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.labResult(u.tenantId, id, b); }
}
