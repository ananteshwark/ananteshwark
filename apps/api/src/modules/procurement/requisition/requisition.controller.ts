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
import { RequisitionService } from './requisition.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateRequisitionDto, UpdateRequisitionDto, RejectRequisitionDto } from './dto/requisition.dto';
import { RequisitionStatus } from './entities/purchase-requisition.entity';

@ApiTags('procurement-requisitions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/requisitions')
export class RequisitionController {
  constructor(private readonly service: RequisitionService) {}

  @Get()
  @RequirePermission('procurement:requisitions:read')
  @ApiOperation({ summary: 'List purchase requisitions' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  list(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('status') status?: RequisitionStatus,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.service.findAll(user.tenantId, pagination, {
      status,
      departmentId,
    });
  }

  @Get(':id')
  @RequirePermission('procurement:requisitions:read')
  @ApiOperation({ summary: 'Get requisition by ID' })
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findOne(user.tenantId, id);
  }

  @Post()
  @RequirePermission('procurement:requisitions:create')
  @ApiOperation({ summary: 'Create a purchase requisition' })
  create(@CurrentUser() user: any, @Body() dto: CreateRequisitionDto) {
    return this.service.createRequisition(user.tenantId, user.id, dto);
  }

  @Patch(':id')
  @RequirePermission('procurement:requisitions:create')
  @ApiOperation({ summary: 'Update a DRAFT requisition' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateRequisitionDto) {
    return this.service.updateRequisition(user.tenantId, id, dto);
  }

  @Post(':id/submit')
  @RequirePermission('procurement:requisitions:create')
  @ApiOperation({ summary: 'Submit a DRAFT requisition for approval' })
  submit(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.submitRequisition(user.tenantId, id);
  }

  @Post(':id/approve')
  @RequirePermission('procurement:requisitions:approve')
  @ApiOperation({ summary: 'Approve a SUBMITTED requisition' })
  approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approveRequisition(user.tenantId, id, user.id);
  }

  @Post(':id/reject')
  @RequirePermission('procurement:requisitions:approve')
  @ApiOperation({ summary: 'Reject a SUBMITTED requisition' })
  reject(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RejectRequisitionDto) {
    return this.service.rejectRequisition(user.tenantId, id, dto.reason, user.id);
  }

  @Post(':id/cancel')
  @RequirePermission('procurement:requisitions:create')
  @ApiOperation({ summary: 'Cancel a requisition' })
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancelRequisition(user.tenantId, id);
  }
}
