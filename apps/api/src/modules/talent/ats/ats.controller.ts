import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AtsService } from './ats.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateJobPostingDto, SubmitApplicationDto, ScheduleInterviewDto, RecordFeedbackDto, MakeOfferDto } from './dto/ats.dto';
import { JobStatus } from './entities/job-posting.entity';
import { ApplicantStatus } from './entities/applicant.entity';

@ApiTags('talent-ats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('talent/ats')
export class AtsController {
  constructor(private readonly service: AtsService) {}

  @Get('jobs')
  @RequirePermission('talent:ats:read')
  @ApiOperation({ summary: 'List job postings' })
  listJobs(@CurrentUser() user: any, @Query() pagination: PaginationDto, @Query('status') status?: JobStatus, @Query('departmentId') departmentId?: string) {
    return this.service.listJobPostings(user.tenantId, pagination, { status, departmentId });
  }

  @Get('jobs/:id')
  @RequirePermission('talent:ats:read')
  getJob(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getJobPosting(user.tenantId, id);
  }

  @Post('jobs')
  @RequirePermission('talent:ats:manage')
  @ApiOperation({ summary: 'Create job posting' })
  createJob(@CurrentUser() user: any, @Body() dto: CreateJobPostingDto) {
    return this.service.createJobPosting(user.tenantId, user.id, dto);
  }

  @Patch('jobs/:id')
  @RequirePermission('talent:ats:manage')
  @ApiOperation({ summary: 'Update a job posting' })
  updateJob(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateJobPosting(user.tenantId, id, dto);
  }

  @Post('jobs/:id/publish')
  @RequirePermission('talent:ats:manage')
  publishJob(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.publishJob(user.tenantId, id);
  }

  @Post('jobs/:id/close')
  @RequirePermission('talent:ats:manage')
  closeJob(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.closeJob(user.tenantId, id);
  }

  @Get('jobs/:id/funnel')
  @RequirePermission('talent:ats:read')
  getFunnel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getHiringFunnel(user.tenantId, id);
  }

  @Get('applicants')
  @RequirePermission('talent:ats:read')
  listApplicants(@CurrentUser() user: any, @Query() pagination: PaginationDto, @Query('jobPostingId') jobPostingId?: string, @Query('status') status?: ApplicantStatus) {
    return this.service.listApplicants(user.tenantId, pagination, { jobPostingId, status });
  }

  @Post('applicants')
  @RequirePermission('talent:ats:read')
  @ApiOperation({ summary: 'Submit application' })
  submitApplication(@CurrentUser() user: any, @Body() dto: SubmitApplicationDto) {
    return this.service.submitApplication(user.tenantId, dto);
  }

  @Post('applicants/:id/shortlist')
  @RequirePermission('talent:ats:manage')
  shortlist(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.shortlistApplicant(user.tenantId, id);
  }

  @Post('applicants/:id/reject')
  @RequirePermission('talent:ats:manage')
  reject(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.rejectApplicant(user.tenantId, id);
  }

  @Post('interviews')
  @RequirePermission('talent:ats:manage')
  scheduleInterview(@CurrentUser() user: any, @Body() dto: ScheduleInterviewDto) {
    return this.service.scheduleInterview(user.tenantId, dto);
  }

  @Post('interviews/:id/feedback')
  @RequirePermission('talent:ats:manage')
  recordFeedback(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RecordFeedbackDto) {
    return this.service.recordInterviewFeedback(user.tenantId, id, dto);
  }

  @Post('offers')
  @RequirePermission('talent:ats:hire')
  makeOffer(@CurrentUser() user: any, @Body() dto: MakeOfferDto) {
    return this.service.makeOffer(user.tenantId, dto);
  }

  @Post('offers/:id/accept')
  @RequirePermission('talent:ats:hire')
  acceptOffer(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.acceptOffer(user.tenantId, id);
  }

  @Post('offers/:id/decline')
  @RequirePermission('talent:ats:hire')
  declineOffer(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.declineOffer(user.tenantId, id);
  }

  // ---- Bulk offers ----
  @Post('offers/bulk')
  @RequirePermission('talent:ats:hire')
  makeBulkOffers(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.makeBulkOffers(user.tenantId, dto);
  }

  // ---- Internal job postings (IJP) ----
  @Get('internal-postings')
  @RequirePermission('talent:ats:read')
  listInternalPostings(@CurrentUser() user: any) {
    return this.service.listInternalPostings(user.tenantId);
  }

  // ---- Referrals ----
  @Get('referrals')
  @RequirePermission('talent:ats:read')
  listReferrals(@CurrentUser() user: any, @Query('mine') mine?: string) {
    return this.service.listReferrals(user.tenantId, mine === 'true' ? user.id : undefined);
  }

  @Post('referrals')
  @RequirePermission('talent:ats:read')
  submitReferral(@CurrentUser() user: any, @Body() dto: any) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unknown';
    return this.service.submitReferral(user.tenantId, { userId: user.id, name }, dto);
  }
}
