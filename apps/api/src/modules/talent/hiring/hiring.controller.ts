import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { HiringService } from './hiring.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { AtsService } from '../ats/ats.service';
import { ScheduleInterviewDto, RecordFeedbackDto, MakeOfferDto } from '../ats/dto/ats.dto';
import { CreateRequisitionDto, UpdateRequisitionDto, RejectRequisitionDto } from './dto/hiring.dto';

@ApiTags('talent-hiring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('talent/hiring')
export class HiringController {
  constructor(
    private readonly hiringService: HiringService,
    private readonly atsService: AtsService,
  ) {}

  // ── Dashboard & Pipeline ───────────────────────────────────────────────────

  @Get('dashboard')
  @RequirePermission('talent:ats:read')
  getDashboard(@CurrentUser() user: any) {
    return this.hiringService.getDashboard(user.tenantId);
  }

  @Get('pipeline')
  @RequirePermission('talent:ats:read')
  getPipeline(@CurrentUser() user: any) {
    return this.hiringService.getPipeline(user.tenantId);
  }

  // ── Interviews ─────────────────────────────────────────────────────────────

  @Get('interviews')
  @RequirePermission('talent:ats:read')
  listInterviews(@CurrentUser() user: any, @Query('jobPostingId') jobPostingId?: string, @Query('status') status?: string) {
    return this.hiringService.listInterviews(user.tenantId, { jobPostingId, status });
  }

  @Post('interviews')
  @RequirePermission('talent:ats:manage')
  scheduleInterview(@CurrentUser() user: any, @Body() dto: ScheduleInterviewDto) {
    return this.atsService.scheduleInterview(user.tenantId, dto);
  }

  @Post('interviews/:id/feedback')
  @RequirePermission('talent:ats:manage')
  recordFeedback(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RecordFeedbackDto) {
    return this.atsService.recordInterviewFeedback(user.tenantId, id, dto);
  }

  // ── Offers ─────────────────────────────────────────────────────────────────

  @Get('offers')
  @RequirePermission('talent:ats:read')
  listOffers(@CurrentUser() user: any, @Query('jobPostingId') jobPostingId?: string) {
    return this.hiringService.listOffers(user.tenantId, { jobPostingId });
  }

  @Post('offers')
  @RequirePermission('talent:ats:manage')
  makeOffer(@CurrentUser() user: any, @Body() dto: MakeOfferDto) {
    return this.atsService.makeOffer(user.tenantId, dto);
  }

  @Post('offers/:id/accept')
  @RequirePermission('talent:ats:manage')
  acceptOffer(@CurrentUser() user: any, @Param('id') id: string) {
    return this.atsService.acceptOffer(user.tenantId, id);
  }

  @Post('offers/:id/decline')
  @RequirePermission('talent:ats:manage')
  declineOffer(@CurrentUser() user: any, @Param('id') id: string) {
    return this.atsService.declineOffer(user.tenantId, id);
  }

  // ── Requisitions (static routes BEFORE :id) ────────────────────────────────

  @Get('requisitions')
  @RequirePermission('talent:ats:read')
  listRequisitions(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.hiringService.listRequisitions(user.tenantId, pagination, { status, departmentId });
  }

  @Post('requisitions')
  @RequirePermission('talent:ats:manage')
  createRequisition(@CurrentUser() user: any, @Body() dto: CreateRequisitionDto) {
    return this.hiringService.createRequisition(user.tenantId, user.id, dto);
  }

  @Get('requisitions/:id')
  @RequirePermission('talent:ats:read')
  getRequisition(@CurrentUser() user: any, @Param('id') id: string) {
    return this.hiringService.getRequisition(user.tenantId, id);
  }

  @Patch('requisitions/:id')
  @RequirePermission('talent:ats:manage')
  updateRequisition(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateRequisitionDto) {
    return this.hiringService.updateRequisition(user.tenantId, id, dto);
  }

  @Post('requisitions/:id/submit')
  @RequirePermission('talent:ats:manage')
  submitRequisition(@CurrentUser() user: any, @Param('id') id: string) {
    return this.hiringService.submitRequisition(user.tenantId, id);
  }

  @Post('requisitions/:id/approve')
  @RequirePermission('talent:ats:hire')
  approveRequisition(@CurrentUser() user: any, @Param('id') id: string) {
    return this.hiringService.approveRequisition(user.tenantId, id, user.id);
  }

  @Post('requisitions/:id/reject')
  @RequirePermission('talent:ats:hire')
  rejectRequisition(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RejectRequisitionDto) {
    return this.hiringService.rejectRequisition(user.tenantId, id, user.id, dto.reason);
  }

  @Post('requisitions/:id/open')
  @RequirePermission('talent:ats:hire')
  openRequisition(@CurrentUser() user: any, @Param('id') id: string) {
    return this.hiringService.openRequisition(user.tenantId, id, user.id);
  }

  @Post('requisitions/:id/cancel')
  @RequirePermission('talent:ats:manage')
  cancelRequisition(@CurrentUser() user: any, @Param('id') id: string) {
    return this.hiringService.cancelRequisition(user.tenantId, id);
  }

  // ── Applicant stage transitions (proxied from ATS) ─────────────────────────

  @Post('applicants/:id/shortlist')
  @RequirePermission('talent:ats:manage')
  shortlist(@CurrentUser() user: any, @Param('id') id: string) {
    return this.atsService.shortlistApplicant(user.tenantId, id);
  }

  @Post('applicants/:id/reject')
  @RequirePermission('talent:ats:manage')
  rejectApplicant(@CurrentUser() user: any, @Param('id') id: string) {
    return this.atsService.rejectApplicant(user.tenantId, id);
  }
}
