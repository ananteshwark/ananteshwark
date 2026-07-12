import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { DeviceService } from './device.service';
import { VisitorStatus } from './entities/device.entity';

@ApiTags('platform-device')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('platform/device')
export class DeviceController {
  constructor(private readonly service: DeviceService) {}

  // ---- Facial check-in ----
  @Post('face/enroll')
  @RequirePermission('device:face:manage')
  @ApiOperation({ summary: 'Enrol a face template reference for an employee' })
  enrollFace(@CurrentUser() user: any, @Body() dto: { employeeId: string; templateRef: string }) {
    return this.service.enrollFace(user.tenantId, dto);
  }

  @Patch('face/:employeeId/deactivate')
  @RequirePermission('device:face:manage')
  deactivateFace(@CurrentUser() user: any, @Param('employeeId') employeeId: string) {
    return this.service.deactivateFace(user.tenantId, employeeId);
  }

  @Post('face/check-in')
  @RequirePermission('device:face:read')
  @ApiOperation({ summary: 'Match a face probe for check-in (via the face-match seam)' })
  faceCheckIn(@CurrentUser() user: any, @Body() body: { probeRef: string }) {
    return this.service.faceCheckIn(user.tenantId, body.probeRef);
  }

  // ---- Mobile config ----
  @Get('mobile/config')
  @RequirePermission('device:mobile:read')
  getMobileConfig(@CurrentUser() user: any) {
    return this.service.getMobileConfig(user.tenantId);
  }

  @Patch('mobile/config')
  @RequirePermission('device:mobile:manage')
  updateMobileConfig(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.updateMobileConfig(user.tenantId, { ...dto, updatedByUserId: user.id });
  }

  @Get('mobile/version-check')
  @RequirePermission('device:mobile:read')
  @ApiOperation({ summary: 'Gate a launching client by version (force-update below min)' })
  versionCheck(@CurrentUser() user: any, @Query('version') version: string) {
    return this.service.checkVersion(user.tenantId, version);
  }

  // ---- Visitor kiosk ----
  @Get('visitors')
  @RequirePermission('device:visitor:read')
  listVisitors(@CurrentUser() user: any, @Query('status') status?: VisitorStatus) {
    return this.service.listVisitors(user.tenantId, status);
  }

  @Post('visitors')
  @RequirePermission('device:visitor:manage')
  preRegister(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.preRegister(user.tenantId, dto);
  }

  @Post('visitors/:id/check-in')
  @RequirePermission('device:visitor:manage')
  checkIn(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { badgeNumber?: string }) {
    return this.service.checkIn(user.tenantId, id, body?.badgeNumber);
  }

  @Post('visitors/no-show-sweep')
  @RequirePermission('device:visitor:manage')
  @ApiOperation({ summary: 'Mark overdue pre-registrations as NO_SHOW (also run hourly by the scheduler)' })
  noShowSweep(@CurrentUser() user: any, @Body() body: { asOf?: string }) {
    return this.service.noShowSweep(user.tenantId, body?.asOf ? new Date(body.asOf) : new Date());
  }

  @Post('visitors/:id/check-out')
  @RequirePermission('device:visitor:manage')
  checkOut(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.checkOut(user.tenantId, id);
  }
}
