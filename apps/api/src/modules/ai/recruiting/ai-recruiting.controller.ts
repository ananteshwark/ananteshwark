import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AiRecruitingService, SchedulingInput } from './ai-recruiting.service';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

@ApiTags('ai-recruiting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('ai/recruiting')
export class AiRecruitingController {
  constructor(private readonly service: AiRecruitingService) {}

  @Get('cv/usage')
  @RequirePermission('ai:recruiting:cv')
  cvUsage(@CurrentUser() user: any, @Query('month') month?: string) {
    return this.service.cvParseUsage(user.tenantId, month ?? currentMonth());
  }

  @Post('cv/parse')
  @RequirePermission('ai:recruiting:cv')
  @ApiOperation({ summary: 'Parse a candidate CV into structured fields (metered; requires key)' })
  parseCv(@CurrentUser() user: any, @Body() body: { text?: string; imageBase64?: string; mediaType?: string; month?: string }) {
    return this.service.parseCv(user.tenantId, body?.month ?? currentMonth(), body ?? {});
  }

  @Post('schedule/propose')
  @RequirePermission('ai:recruiting:read')
  @ApiOperation({ summary: 'Propose interview slots across a panel and candidate availability' })
  propose(@CurrentUser() _user: any, @Body() body: SchedulingInput) {
    return this.service.proposeSlots(body);
  }
}
