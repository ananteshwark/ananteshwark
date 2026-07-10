import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { MsfService } from './msf.service';
import { MsfStatus, RaterRelationship } from './entities/msf-campaign.entity';

@ApiTags('talent-msf')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('talent/msf')
export class MsfController {
  constructor(private readonly service: MsfService) {}

  @Get('campaigns')
  @RequirePermission('talent:msf:read')
  listCampaigns(@CurrentUser() user: any, @Query('status') status?: MsfStatus) {
    return this.service.listCampaigns(user.tenantId, status);
  }

  @Post('campaigns')
  @RequirePermission('talent:msf:manage')
  createCampaign(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createCampaign(user.tenantId, dto);
  }

  @Get('campaigns/:id')
  @RequirePermission('talent:msf:read')
  getCampaign(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getCampaign(user.tenantId, id);
  }

  @Get('campaigns/:id/raters')
  @RequirePermission('talent:msf:read')
  listRaters(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.listRaters(user.tenantId, id);
  }

  @Post('campaigns/:id/raters')
  @RequirePermission('talent:msf:manage')
  addRater(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { raterEmployeeId: string; raterName?: string; relationship?: RaterRelationship }) {
    return this.service.addRater(user.tenantId, id, dto);
  }

  @Post('campaigns/:id/launch')
  @RequirePermission('talent:msf:manage')
  launch(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.launch(user.tenantId, id);
  }

  @Post('campaigns/:id/close')
  @RequirePermission('talent:msf:manage')
  close(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.close(user.tenantId, id);
  }

  @Get('campaigns/:id/report')
  @RequirePermission('talent:msf:read')
  @ApiOperation({ summary: 'Aggregated 360 report with anonymity suppression and self-vs-others gaps' })
  report(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.report(user.tenantId, id);
  }

  @Post('raters/:raterId/respond')
  @RequirePermission('talent:msf:respond')
  @ApiOperation({ summary: 'Submit a rater questionnaire' })
  respond(@CurrentUser() user: any, @Param('raterId') raterId: string, @Body() dto: { ratings: Array<{ competencyKey: string; score: number }>; strengths?: string; improvements?: string }) {
    return this.service.submitResponse(user.tenantId, raterId, dto);
  }

  @Post('raters/:raterId/decline')
  @RequirePermission('talent:msf:respond')
  decline(@CurrentUser() user: any, @Param('raterId') raterId: string) {
    return this.service.declineRater(user.tenantId, raterId);
  }
}
