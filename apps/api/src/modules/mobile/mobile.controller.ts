import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MobileService } from './mobile.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('mobile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('mobile')
export class MobileController {
  constructor(private readonly service: MobileService) {}

  // ─── Ph-262: receipt OCR parse ────────────────────────────────────
  @Post('receipt-parse')
  @RequirePermission('expenses:read')
  @ApiOperation({ summary: 'Parse OCR text into expense fields' })
  parseReceipt(@CurrentUser() _u: any, @Body() b: { ocrText: string }) { return this.service.parseReceipt(b.ocrText); }

  // ─── Ph-263: mobile timesheet ─────────────────────────────────────
  @Post('checkin')
  @RequirePermission('hr:read')
  @ApiOperation({ summary: 'GPS timesheet check-in' })
  checkIn(@CurrentUser() u: any, @Body() b: any) { return this.service.checkIn(u.tenantId, { ...b, employeeId: b.employeeId ?? u.id }); }

  @Post('checkin/:id/checkout')
  @RequirePermission('hr:read')
  checkOut(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { at: string }) { return this.service.checkOut(u.tenantId, id, b.at); }

  @Get('timesheet')
  @RequirePermission('hr:read')
  @ApiQuery({ name: 'employeeId', required: true })
  @ApiQuery({ name: 'weekStart', required: true })
  @ApiQuery({ name: 'weekEnd', required: true })
  timesheet(@CurrentUser() u: any, @Query('employeeId') employeeId: string, @Query('weekStart') weekStart: string, @Query('weekEnd') weekEnd: string) {
    return this.service.weeklyTimesheet(u.tenantId, employeeId, weekStart, weekEnd);
  }

  @Get('checkins')
  @RequirePermission('hr:read')
  @ApiQuery({ name: 'employeeId', required: true })
  checkins(@CurrentUser() u: any, @Query('employeeId') employeeId: string) { return this.service.listCheckins(u.tenantId, employeeId); }

  // ─── Ph-264: warehouse scan ───────────────────────────────────────
  @Post('scan-confirm')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Confirm a warehouse scan against the expected line' })
  confirmScan(@CurrentUser() _u: any, @Body() b: { expected: any; scanned: any }) { return this.service.confirmScan(b.expected, b.scanned); }
}
