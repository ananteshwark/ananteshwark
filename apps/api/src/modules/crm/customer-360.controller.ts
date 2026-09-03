import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Customer360Service } from './customer-360.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('crm/customer-360')
export class Customer360Controller {
  constructor(private readonly service: Customer360Service) {}

  @Get()
  @RequirePermission('crm:contacts:read')
  @ApiOperation({ summary: 'List customers for the 360 picker' })
  @ApiQuery({ name: 'search', required: false })
  listForPicker(@CurrentUser() user: any, @Query('search') search?: string) {
    return this.service.listCustomersForPicker(user.tenantId, search);
  }

  @Get(':customerId')
  @RequirePermission('crm:contacts:read')
  @ApiOperation({ summary: 'Customer 360 unified view (timeline + financials)' })
  getCustomer360(@CurrentUser() user: any, @Param('customerId') customerId: string) {
    return this.service.getCustomer360(user.tenantId, customerId);
  }
}
