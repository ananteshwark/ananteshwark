import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PromisingService } from './promising.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('sales-promising')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sales/promising')
export class PromisingController {
  constructor(private readonly service: PromisingService) {}

  @Get('sourcing-rules')
  @RequirePermission('sales:read')
  @ApiQuery({ name: 'itemId', required: false })
  listRules(@CurrentUser() u: any, @Query('itemId') itemId?: string) {
    return this.service.listRules(u.tenantId, itemId);
  }

  @Post('sourcing-rules')
  @RequirePermission('sales:manage')
  @ApiOperation({ summary: 'Create a sourcing rule (ranked supply source)' })
  createRule(@CurrentUser() u: any, @Body() b: any) {
    return this.service.createRule(u.tenantId, b);
  }

  @Delete('sourcing-rules/:id')
  @RequirePermission('sales:manage')
  deleteRule(@CurrentUser() u: any, @Param('id') id: string) {
    return this.service.deleteRule(u.tenantId, id);
  }

  @Post('promise')
  @RequirePermission('sales:read')
  @ApiOperation({ summary: 'Global order promising: date-based ATP with scheduled receipts' })
  promise(@CurrentUser() u: any, @Body() b: any) {
    return this.service.promise(u.tenantId, b);
  }

  @Post('sourcing-plan')
  @RequirePermission('sales:read')
  @ApiOperation({ summary: 'Ranked sourcing plan with allocation for an item' })
  sourcingPlan(@CurrentUser() u: any, @Body() b: { itemId: string; quantity: number }) {
    return this.service.sourcingPlan(u.tenantId, b.itemId, b.quantity);
  }
}
