import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { IdpService } from './idp.service';
import { IdpItemStatus } from './idp.entity';

@ApiTags('talent-idp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('talent/idp')
export class IdpController {
  constructor(private readonly service: IdpService) {}

  @Get('plans')
  @RequirePermission('talent:idp:read')
  listPlans(@CurrentUser() user: any, @Query('employeeId') employeeId?: string) {
    return this.service.listPlans(user.tenantId, employeeId);
  }

  @Get('plans/:id')
  @RequirePermission('talent:idp:read')
  getPlan(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getPlan(user.tenantId, id);
  }

  @Post('plans')
  @RequirePermission('talent:idp:manage')
  @ApiOperation({ summary: 'Create a development plan for an employee' })
  createPlan(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createPlan(user.tenantId, user.id, dto);
  }

  @Post('plans/:id/items')
  @RequirePermission('talent:idp:manage')
  addItem(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.addItem(user.tenantId, id, dto);
  }

  @Patch('items/:itemId/status')
  @RequirePermission('talent:idp:manage')
  updateItemStatus(
    @CurrentUser() user: any,
    @Param('itemId') itemId: string,
    @Body() body: { status: IdpItemStatus; notes?: string },
  ) {
    return this.service.updateItemStatus(user.tenantId, itemId, body?.status, body?.notes);
  }

  @Post('plans/:id/activate')
  @RequirePermission('talent:idp:manage')
  activatePlan(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.activatePlan(user.tenantId, id);
  }

  @Post('plans/:id/complete')
  @RequirePermission('talent:idp:manage')
  completePlan(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.completePlan(user.tenantId, id);
  }
}
