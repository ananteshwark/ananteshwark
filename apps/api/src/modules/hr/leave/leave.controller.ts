import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LeaveService } from './leave.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateLeaveTypeDto, UpdateLeaveTypeDto, ApplyLeaveDto } from './dto/leave.dto';

@ApiTags('hr-leave')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('types')
  @RequirePermission('hr:leave:read')
  listLeaveTypes(@CurrentUser() user: any) {
    return this.leaveService.listLeaveTypes(user.tenantId);
  }

  @Post('types')
  @RequirePermission('hr:leave:approve')
  createLeaveType(@CurrentUser() user: any, @Body() dto: CreateLeaveTypeDto) {
    return this.leaveService.createLeaveType(user.tenantId, dto);
  }

  @Patch('types/:id')
  @RequirePermission('hr:leave:approve')
  updateLeaveType(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateLeaveTypeDto) {
    return this.leaveService.updateLeaveType(user.tenantId, id, dto);
  }

  @Get('balance')
  @RequirePermission('hr:leave:read')
  getBalance(
    @CurrentUser() user: any,
    @Query('employeeId') employeeId: string,
    @Query('leaveYear') leaveYear?: string,
  ) {
    return this.leaveService.getBalance(user.tenantId, employeeId, leaveYear ? parseInt(leaveYear) : undefined);
  }

  @Post('applications')
  @RequirePermission('hr:leave:apply')
  applyLeave(@CurrentUser() user: any, @Body() dto: ApplyLeaveDto) {
    return this.leaveService.applyLeave(user.tenantId, dto);
  }

  @Get('applications')
  @RequirePermission('hr:leave:read')
  listApplications(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
  ) {
    return this.leaveService.listApplications(user.tenantId, pagination, { employeeId, status });
  }

  @Post('applications/:id/approve')
  @RequirePermission('hr:leave:approve')
  approveLeave(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { remarks?: string },
  ) {
    return this.leaveService.approveLeave(user.tenantId, id, user.id, body.remarks);
  }

  @Post('applications/:id/reject')
  @RequirePermission('hr:leave:approve')
  rejectLeave(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { remarks?: string },
  ) {
    return this.leaveService.rejectLeave(user.tenantId, id, user.id, body.remarks);
  }

  @Post('applications/:id/cancel')
  @RequirePermission('hr:leave:apply')
  cancelLeave(@CurrentUser() user: any, @Param('id') id: string) {
    return this.leaveService.cancelLeave(user.tenantId, id, user.id);
  }

  @Post('applications/:id/withdraw')
  @RequirePermission('hr:leave:apply')
  withdrawLeave(@CurrentUser() user: any, @Param('id') id: string) {
    return this.leaveService.withdrawLeave(user.tenantId, id, user.id);
  }

  @Get('calendar')
  @RequirePermission('hr:leave:read')
  getLeaveCalendar(
    @CurrentUser() user: any,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.leaveService.getLeaveCalendar(user.tenantId, parseInt(month), parseInt(year));
  }

  // ---- Blackout windows ----
  @Get('blackouts')
  @RequirePermission('hr:leave:read')
  listBlackouts(@CurrentUser() user: any) {
    return this.leaveService.listBlackouts(user.tenantId);
  }

  @Post('blackouts')
  @RequirePermission('hr:leave:approve')
  createBlackout(@CurrentUser() user: any, @Body() dto: { name: string; fromDate: string; toDate: string; leaveTypeId?: string; reason?: string }) {
    return this.leaveService.createBlackout(user.tenantId, dto);
  }

  @Patch('blackouts/:id/deactivate')
  @RequirePermission('hr:leave:approve')
  deactivateBlackout(@CurrentUser() user: any, @Param('id') id: string) {
    return this.leaveService.deactivateBlackout(user.tenantId, id);
  }

  // ---- Encashment ----
  @Get('encashments')
  @RequirePermission('hr:leave:read')
  listEncashments(@CurrentUser() user: any, @Query('employeeId') employeeId?: string) {
    return this.leaveService.listEncashments(user.tenantId, employeeId);
  }

  @Post('encashments')
  @RequirePermission('hr:leave:apply')
  requestEncashment(@CurrentUser() user: any, @Body() dto: { employeeId: string; leaveTypeId: string; units: number; leaveYear?: number }) {
    return this.leaveService.requestEncashment(user.tenantId, dto);
  }

  @Post('encashments/:id/approve')
  @RequirePermission('hr:leave:approve')
  approveEncashment(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { remarks?: string }) {
    return this.leaveService.approveEncashment(user.tenantId, id, user.id, body?.remarks);
  }

  @Post('encashments/:id/reject')
  @RequirePermission('hr:leave:approve')
  rejectEncashment(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { remarks?: string }) {
    return this.leaveService.rejectEncashment(user.tenantId, id, user.id, body?.remarks);
  }

  // ---- Occasion auto-grants ----
  @Post('occasion-grants/run')
  @RequirePermission('hr:leave:approve')
  runOccasionGrants(@CurrentUser() user: any, @Body() body?: { asOf?: string }) {
    return this.leaveService.grantOccasionLeaves(user.tenantId, body?.asOf);
  }
}
