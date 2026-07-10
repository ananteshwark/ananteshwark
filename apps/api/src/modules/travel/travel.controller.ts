import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TravelService } from './travel.service';
import { TravelRequestStatus } from './entities/travel-request.entity';

@ApiTags('travel')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('travel')
export class TravelController {
  constructor(private readonly service: TravelService) {}

  @Get('requests')
  @RequirePermission('expenses:travel:read')
  findAll(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('status') status?: TravelRequestStatus,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.service.findAll(user.tenantId, pagination, { status, employeeId });
  }

  @Post('requests')
  @RequirePermission('expenses:travel:create')
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createRequest(user.tenantId, user.id, dto);
  }

  @Get('requests/:id')
  @RequirePermission('expenses:travel:read')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findOne(user.tenantId, id);
  }

  @Patch('requests/:id/submit')
  @RequirePermission('expenses:travel:create')
  submit(@CurrentUser() user: any, @Param('id') id: string, @Body() body?: { exceptionJustification?: string }) {
    return this.service.submit(user.tenantId, id, { exceptionJustification: body?.exceptionJustification });
  }

  @Patch('requests/:id/approve')
  @RequirePermission('expenses:travel:approve')
  approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approve(user.tenantId, id, user.id);
  }

  @Patch('requests/:id/reject')
  @RequirePermission('expenses:travel:approve')
  reject(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.service.reject(user.tenantId, id, body?.reason);
  }

  @Patch('requests/:id/complete')
  @RequirePermission('expenses:travel:create')
  complete(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { expenseClaimId?: string }) {
    return this.service.complete(user.tenantId, id, body?.expenseClaimId);
  }

  @Patch('requests/:id/cancel')
  @RequirePermission('expenses:travel:create')
  cancel(@CurrentUser() user: any, @Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.service.cancel(user.tenantId, id, body?.reason);
  }

  @Patch('requests/:id/accommodation')
  @RequirePermission('expenses:travel:create')
  setAccommodation(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { legs: any[] }) {
    return this.service.setAccommodation(user.tenantId, id, body?.legs ?? []);
  }

  // ---- Admin/agent ↔ employee chat ----
  @Get('requests/:id/comments')
  @RequirePermission('expenses:travel:read')
  listComments(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.listComments(user.tenantId, id);
  }

  @Post('requests/:id/comments')
  @RequirePermission('expenses:travel:read')
  addComment(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { body: string; role?: string }) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unknown';
    return this.service.addComment(user.tenantId, id, { userId: user.id, name, role: body?.role }, body?.body);
  }
}
