import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateShiftDto, UpdateShiftDto, CreateShiftAssignmentDto, CreateHolidayDto, MarkAttendanceDto, CreateTimeEntryDto } from './dto/attendance.dto';

@ApiTags('hr-attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('shifts')
  @RequirePermission('hr:attendance:read')
  listShifts(@CurrentUser() user: any) {
    return this.attendanceService.findShifts(user.tenantId);
  }

  @Post('shifts')
  @RequirePermission('hr:attendance:create')
  createShift(@CurrentUser() user: any, @Body() dto: CreateShiftDto) {
    return this.attendanceService.createShift(user.tenantId, dto);
  }

  @Patch('shifts/:id')
  @RequirePermission('hr:attendance:create')
  updateShift(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.attendanceService.updateShift(user.tenantId, id, dto);
  }

  @Post('shift-assignments')
  @RequirePermission('hr:attendance:create')
  createShiftAssignment(@CurrentUser() user: any, @Body() dto: CreateShiftAssignmentDto) {
    return this.attendanceService.createShiftAssignment(user.tenantId, dto);
  }

  @Get('holidays')
  @RequirePermission('hr:attendance:read')
  listHolidays(@CurrentUser() user: any, @Query('year') year?: string) {
    return this.attendanceService.findHolidays(user.tenantId, year ? parseInt(year) : undefined);
  }

  @Post('holidays')
  @RequirePermission('hr:attendance:create')
  createHoliday(@CurrentUser() user: any, @Body() dto: CreateHolidayDto) {
    return this.attendanceService.createHoliday(user.tenantId, dto);
  }

  @Get('attendance')
  @RequirePermission('hr:attendance:read')
  listAttendance(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.attendanceService.findAttendance(user.tenantId, pagination, { employeeId, from, to, status });
  }

  @Get('attendance/monthly')
  @RequirePermission('hr:attendance:read')
  getMonthlyReport(
    @CurrentUser() user: any,
    @Query('employeeId') employeeId: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.attendanceService.getMonthlyReport(user.tenantId, employeeId, parseInt(month), parseInt(year));
  }

  @Post('attendance')
  @RequirePermission('hr:attendance:create')
  markAttendance(@CurrentUser() user: any, @Body() dto: MarkAttendanceDto) {
    return this.attendanceService.markAttendance(user.tenantId, dto);
  }

  @Post('attendance/bulk')
  @RequirePermission('hr:attendance:create')
  bulkImport(@CurrentUser() user: any, @Body() body: { records: MarkAttendanceDto[] }) {
    return this.attendanceService.bulkImport(user.tenantId, body.records);
  }

  @Post('attendance/:id/regularize')
  @RequirePermission('hr:attendance:approve')
  regularize(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { remarks: string },
  ) {
    return this.attendanceService.regularize(user.tenantId, id, body.remarks, user.id);
  }

  @Get('time-entries')
  @RequirePermission('hr:attendance:read')
  listTimeEntries(
    @CurrentUser() user: any,
    @Query('employeeId') employeeId: string,
    @Query('date') date?: string,
  ) {
    return this.attendanceService.findTimeEntries(user.tenantId, employeeId, date);
  }

  @Post('time-entries')
  @RequirePermission('hr:attendance:create')
  createTimeEntry(@CurrentUser() user: any, @Body() dto: CreateTimeEntryDto) {
    return this.attendanceService.createTimeEntry(user.tenantId, dto);
  }

  @Get('timesheets')
  @RequirePermission('hr:attendance:read')
  listTimesheets(
    @CurrentUser() user: any,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
  ) {
    return this.attendanceService.listTimesheets(user.tenantId, { employeeId, status });
  }

  @Post('timesheets/submit')
  @RequirePermission('hr:attendance:create')
  submitTimesheet(
    @CurrentUser() user: any,
    @Body() body: { employeeId: string; weekStart: string; weekEnd: string },
  ) {
    return this.attendanceService.submitTimesheet(user.tenantId, body.employeeId, body.weekStart, body.weekEnd);
  }

  @Post('timesheets/:id/approve')
  @RequirePermission('hr:attendance:approve')
  approveTimesheet(@CurrentUser() user: any, @Param('id') id: string) {
    return this.attendanceService.approveTimesheet(user.tenantId, id, user.id);
  }
}
