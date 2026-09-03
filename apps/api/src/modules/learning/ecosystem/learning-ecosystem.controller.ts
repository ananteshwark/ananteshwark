import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { LearningEcosystemService } from './learning-ecosystem.service';
import { LearningProviderType, TrainingMode, SessionStatus } from './entities/learning-ecosystem.entity';

@ApiTags('learning-ecosystem')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('learning/ecosystem')
export class LearningEcosystemController {
  constructor(private readonly service: LearningEcosystemService) {}

  // ---- Providers ----
  @Get('providers')
  @RequirePermission('learning:ecosystem:read')
  listProviders(@CurrentUser() user: any, @Query('type') type?: LearningProviderType) {
    return this.service.listProviders(user.tenantId, type);
  }

  @Post('providers')
  @RequirePermission('learning:ecosystem:manage')
  registerProvider(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.registerProvider(user.tenantId, dto);
  }

  // ---- xAPI ----
  @Post('xapi/statements')
  @RequirePermission('learning:ecosystem:ingest')
  @ApiOperation({ summary: 'Ingest an xAPI (Tin Can) statement from an external LMS (idempotent)' })
  ingest(@CurrentUser() user: any, @Body() raw: any) {
    return this.service.ingestStatement(user.tenantId, raw);
  }

  @Get('xapi/statements')
  @RequirePermission('learning:ecosystem:read')
  listStatements(@CurrentUser() user: any, @Query('actorEmail') actorEmail?: string) {
    return this.service.listStatements(user.tenantId, actorEmail);
  }

  // ---- ILT / VILT sessions ----
  @Get('sessions')
  @RequirePermission('learning:ecosystem:read')
  listSessions(@CurrentUser() user: any, @Query('status') status?: SessionStatus) {
    return this.service.listSessions(user.tenantId, status);
  }

  @Post('sessions')
  @RequirePermission('learning:ecosystem:manage')
  @ApiOperation({ summary: 'Create an ILT/VILT session (VILT provisions a meeting via the seam)' })
  createSession(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createSession(user.tenantId, dto);
  }

  @Post('sessions/:id/enroll')
  @RequirePermission('learning:ecosystem:read')
  enroll(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.enroll(user.tenantId, id);
  }

  @Patch('sessions/:id/status')
  @RequirePermission('learning:ecosystem:manage')
  setStatus(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { status: SessionStatus }) {
    return this.service.setSessionStatus(user.tenantId, id, body.status);
  }
}
