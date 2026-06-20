import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PoService } from './po.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreatePoDto, UpdatePoDto } from './dto/po.dto';
import { PoStatus } from './entities/purchase-order.entity';

@ApiTags('procurement-po')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/purchase-orders')
export class PoController {
  constructor(private readonly service: PoService) {}

  @Get()
  @RequirePermission('procurement:po:read')
  @ApiOperation({ summary: 'List purchase orders' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'vendorId', required: false })
  list(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('status') status?: PoStatus,
    @Query('vendorId') vendorId?: string,
  ) {
    return this.service.findAll(user.tenantId, pagination, { status, vendorId });
  }

  // Declared before ':id' so the literal 'approval-matrix' path isn't
  // captured as an :id lookup.
  @Get('approval-matrix')
  @RequirePermission('procurement:po:read')
  @ApiOperation({ summary: 'List approval matrices' })
  listMatrices(@CurrentUser() user: any) {
    return this.service.listApprovalMatrices(user.tenantId);
  }

  @Get(':id')
  @RequirePermission('procurement:po:read')
  @ApiOperation({ summary: 'Get PO with lines' })
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findOne(user.tenantId, id);
  }

  @Post()
  @RequirePermission('procurement:po:create')
  @ApiOperation({ summary: 'Create a draft PO' })
  create(@CurrentUser() user: any, @Body() dto: CreatePoDto) {
    return this.service.createPo(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('procurement:po:create')
  @ApiOperation({ summary: 'Update a DRAFT PO' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdatePoDto) {
    return this.service.updatePo(user.tenantId, id, dto);
  }

  @Post(':id/approve')
  @RequirePermission('procurement:po:approve')
  @ApiOperation({ summary: 'Approve a DRAFT PO' })
  approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approvePo(user.tenantId, id, user.id);
  }

  @Post(':id/send')
  @RequirePermission('procurement:po:approve')
  @ApiOperation({ summary: 'Send an APPROVED PO to vendor' })
  send(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.sendPo(user.tenantId, id);
  }

  @Post(':id/cancel')
  @RequirePermission('procurement:po:create')
  @ApiOperation({ summary: 'Cancel a PO' })
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancelPo(user.tenantId, id);
  }

  // ─── Approval Matrix ──────────────────────────────────────────

  @Post('approval-matrix')
  @RequirePermission('procurement:po:approve')
  @ApiOperation({ summary: 'Create approval matrix' })
  createMatrix(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createApprovalMatrix(user.tenantId, dto);
  }

  @Patch('approval-matrix/:id')
  @RequirePermission('procurement:po:approve')
  @ApiOperation({ summary: 'Update approval matrix' })
  updateMatrix(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateApprovalMatrix(user.tenantId, id, dto);
  }

  @Get(':id/required-approvals')
  @RequirePermission('procurement:po:read')
  @ApiOperation({ summary: 'Get required approval levels for a PO' })
  async getRequiredApprovals(@CurrentUser() user: any, @Param('id') id: string) {
    const po = await this.service.findOne(user.tenantId, id);
    const levels = await this.service.getRequiredApprovalLevels(user.tenantId, Number(po.total));
    return { poId: id, total: po.total, requiredLevels: levels };
  }
}
