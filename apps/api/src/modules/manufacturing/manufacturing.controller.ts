import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ManufacturingService } from './manufacturing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreateBomDto, CreateWorkCenterDto, CreateProductionOrderDto,
  CompleteProductionOrderDto, IssueMaterialDto,
} from './dto/manufacturing.dto';

@ApiTags('manufacturing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('manufacturing')
export class ManufacturingController {
  constructor(private readonly service: ManufacturingService) {}

  // BOMs
  @Get('boms')
  @RequirePermission('manufacturing:read')
  listBoms(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listBoms(user.tenantId, pagination);
  }

  @Get('boms/:id')
  @RequirePermission('manufacturing:read')
  getBom(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getBom(user.tenantId, id);
  }

  @Post('boms')
  @RequirePermission('manufacturing:manage')
  createBom(@CurrentUser() user: any, @Body() dto: CreateBomDto) {
    return this.service.createBom(user.tenantId, dto);
  }

  @Post('boms/:id/activate')
  @RequirePermission('manufacturing:manage')
  activateBom(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.activateBom(user.tenantId, id);
  }

  // Work Centers
  @Get('work-centers')
  @RequirePermission('manufacturing:read')
  listWorkCenters(@CurrentUser() user: any) {
    return this.service.listWorkCenters(user.tenantId);
  }

  @Post('work-centers')
  @RequirePermission('manufacturing:manage')
  createWorkCenter(@CurrentUser() user: any, @Body() dto: CreateWorkCenterDto) {
    return this.service.createWorkCenter(user.tenantId, dto);
  }

  // Production Orders
  @Get('orders')
  @RequirePermission('manufacturing:read')
  listOrders(@CurrentUser() user: any, @Query() pagination: PaginationDto, @Query('status') status?: string) {
    return this.service.listOrders(user.tenantId, pagination, status);
  }

  @Post('orders')
  @RequirePermission('manufacturing:manage')
  createOrder(@CurrentUser() user: any, @Body() dto: CreateProductionOrderDto) {
    return this.service.createOrder(user.tenantId, dto);
  }

  @Post('orders/:id/release')
  @RequirePermission('manufacturing:manage')
  releaseOrder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.releaseOrder(user.tenantId, id);
  }

  @Post('orders/:id/complete')
  @RequirePermission('manufacturing:manage')
  completeOrder(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CompleteProductionOrderDto) {
    return this.service.completeOrder(user.tenantId, id, dto, user.id);
  }

  @Post('orders/:id/issue-material')
  @RequirePermission('manufacturing:manage')
  issueMaterial(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: IssueMaterialDto) {
    return this.service.issueMaterial(user.tenantId, id, dto);
  }

  @Get('orders/:id/issuances')
  @RequirePermission('manufacturing:read')
  getIssuances(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getIssuances(user.tenantId, id);
  }
}
