import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AcademyService } from './academy.service';
import { CertEnrollmentStatus } from './entities/academy.entity';

@ApiTags('learning-academy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('learning/academy')
export class AcademyController {
  constructor(private readonly service: AcademyService) {}

  @Get('certifications')
  @RequirePermission('academy:read')
  listCertifications(@CurrentUser() user: any) {
    return this.service.listCertifications(user.tenantId);
  }

  @Post('certifications')
  @RequirePermission('academy:manage')
  createCertification(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createCertification(user.tenantId, dto);
  }

  @Get('enrollments')
  @RequirePermission('academy:read')
  listEnrollments(@CurrentUser() user: any, @Query('learnerId') learnerId?: string, @Query('certId') certId?: string, @Query('status') status?: CertEnrollmentStatus) {
    return this.service.listEnrollments(user.tenantId, { learnerId, certId, status });
  }

  @Post('certifications/:id/enroll')
  @RequirePermission('academy:enroll')
  enroll(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { learnerId?: string }) {
    return this.service.enroll(user.tenantId, id, body?.learnerId ?? user.id);
  }

  @Post('enrollments/:id/requirement')
  @RequirePermission('academy:manage')
  @ApiOperation({ summary: 'Record a requirement as met; certifies when all requirements pass' })
  recordRequirement(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { ref: string; score?: number }) {
    return this.service.recordRequirement(user.tenantId, id, body, new Date());
  }

  @Post('expire-sweep')
  @RequirePermission('academy:manage')
  @ApiOperation({ summary: 'Expire certified-but-lapsed enrolments (also run hourly by the scheduler)' })
  expireSweep(@CurrentUser() user: any, @Body() body: { asOf?: string }) {
    return this.service.expireSweep(user.tenantId, body?.asOf ?? new Date().toISOString().slice(0, 10));
  }
}
