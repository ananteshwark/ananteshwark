import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { FeedbackService } from './feedback.service';

const displayName = (user: any) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unknown';

@ApiTags('talent-feedback')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('talent/feedback')
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Post()
  @RequirePermission('talent:feedback:create')
  @ApiOperation({ summary: 'Give continuous feedback (optionally answering a request)' })
  give(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.give(user.tenantId, { userId: user.id, name: displayName(user) }, dto);
  }

  @Get('about/:employeeId')
  @RequirePermission('talent:feedback:read')
  @ApiOperation({ summary: 'Feedback about an employee, scoped by viewer (self|manager|public)' })
  listFor(
    @CurrentUser() user: any,
    @Param('employeeId') employeeId: string,
    @Query('scope') scope?: string,
  ) {
    const viewerScope = scope === 'self' ? 'self' : scope === 'manager' ? 'manager' : 'public';
    return this.service.listFor(user.tenantId, employeeId, viewerScope);
  }

  @Post('requests')
  @RequirePermission('talent:feedback:create')
  @ApiOperation({ summary: 'Ask named colleagues for feedback about an employee' })
  request(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.request(user.tenantId, user.id, dto);
  }

  @Get('requests/pending')
  @RequirePermission('talent:feedback:read')
  @ApiOperation({ summary: 'Feedback requests waiting on me' })
  myPendingRequests(@CurrentUser() user: any) {
    return this.service.myPendingRequests(user.tenantId, user.id);
  }

  @Post('requests/:id/close')
  @RequirePermission('talent:feedback:create')
  close(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.close(user.tenantId, id, user.id);
  }
}
