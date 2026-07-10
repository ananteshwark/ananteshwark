import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { SurveysService } from './surveys.service';
import { RecognitionService } from './recognition.service';
import { FeedService } from './feed.service';
import { FeedGroupService } from './feed-group.service';
import { NominationService } from './nomination.service';
import { SurveyStatus } from './entities/survey.entity';
import { NominationProgramStatus } from './entities/recognition-nomination.entity';

const displayName = (user: any) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

@ApiTags('engagement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('engagement')
export class EngagementController {
  constructor(
    private readonly surveys: SurveysService,
    private readonly recognition: RecognitionService,
    private readonly feed: FeedService,
    private readonly groups: FeedGroupService,
    private readonly nominations: NominationService,
  ) {}

  // ─── Surveys ──────────────────────────────────────────────────

  @Get('surveys')
  @RequirePermission('hr:surveys:read')
  listSurveys(@CurrentUser() user: any, @Query('status') status?: SurveyStatus) {
    return this.surveys.listSurveys(user.tenantId, status);
  }

  @Post('surveys')
  @RequirePermission('hr:surveys:manage')
  createSurvey(@CurrentUser() user: any, @Body() dto: any) {
    return this.surveys.createSurvey(user.tenantId, user.id, dto);
  }

  @Get('surveys/:id')
  @RequirePermission('hr:surveys:read')
  getSurvey(@CurrentUser() user: any, @Param('id') id: string) {
    return this.surveys.getSurvey(user.tenantId, id);
  }

  @Patch('surveys/:id/publish')
  @RequirePermission('hr:surveys:manage')
  publishSurvey(@CurrentUser() user: any, @Param('id') id: string) {
    return this.surveys.activate(user.tenantId, id);
  }

  @Patch('surveys/:id/close')
  @RequirePermission('hr:surveys:manage')
  closeSurvey(@CurrentUser() user: any, @Param('id') id: string) {
    return this.surveys.close(user.tenantId, id);
  }

  @Post('surveys/:id/respond')
  @RequirePermission('hr:surveys:read')
  respond(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { answers: Record<string, any> }) {
    return this.surveys.submitResponse(user.tenantId, id, user.id, body?.answers ?? {});
  }

  @Get('surveys/:id/responded')
  @RequirePermission('hr:surveys:read')
  async responded(@CurrentUser() user: any, @Param('id') id: string) {
    return { responded: await this.surveys.hasResponded(user.tenantId, id, user.id) };
  }

  @Get('surveys/:id/results')
  @RequirePermission('hr:surveys:manage')
  results(@CurrentUser() user: any, @Param('id') id: string) {
    return this.surveys.results(user.tenantId, id);
  }

  // ─── Recognition ──────────────────────────────────────────────

  @Get('recognition/badges')
  @RequirePermission('hr:recognition:read')
  listBadges(@CurrentUser() user: any, @Query('activeOnly') activeOnly?: string) {
    return this.recognition.listBadges(user.tenantId, activeOnly === 'true');
  }

  @Post('recognition/badges')
  @RequirePermission('hr:recognition:manage')
  createBadge(@CurrentUser() user: any, @Body() dto: any) {
    return this.recognition.createBadge(user.tenantId, dto);
  }

  @Patch('recognition/badges/:id')
  @RequirePermission('hr:recognition:manage')
  updateBadge(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.recognition.updateBadge(user.tenantId, id, dto);
  }

  @Post('recognition')
  @RequirePermission('hr:recognition:read')
  give(@CurrentUser() user: any, @Body() dto: any) {
    return this.recognition.give(user.tenantId, { userId: user.id, name: displayName(user) }, dto);
  }

  @Get('recognition/wall')
  @RequirePermission('hr:recognition:read')
  wall(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.recognition.wall(user.tenantId, pagination);
  }

  @Get('recognition/leaderboard')
  @RequirePermission('hr:recognition:read')
  leaderboard(@CurrentUser() user: any, @Query('since') since?: string) {
    return this.recognition.leaderboard(user.tenantId, since);
  }

  @Get('recognition/employee/:employeeId')
  @RequirePermission('hr:recognition:read')
  forEmployee(@CurrentUser() user: any, @Param('employeeId') employeeId: string) {
    return this.recognition.forEmployee(user.tenantId, employeeId);
  }

  // ─── Company feed ─────────────────────────────────────────────

  @Get('feed')
  @RequirePermission('hr:feed:read')
  listFeed(@CurrentUser() user: any, @Query() pagination: PaginationDto, @Query('groupId') groupId?: string) {
    // ?groupId=none → company-wide only; a value → that group; absent → all.
    const filter = groupId === 'none' ? null : groupId;
    return this.feed.listFeed(user.tenantId, pagination, { groupId: filter });
  }

  @Post('feed/posts')
  @RequirePermission('hr:feed:read')
  createPost(@CurrentUser() user: any, @Body() dto: any) {
    return this.feed.createPost(user.tenantId, { userId: user.id, name: displayName(user) }, dto);
  }

  @Post('feed/announcements')
  @RequirePermission('hr:feed:manage')
  createAnnouncement(@CurrentUser() user: any, @Body() dto: any) {
    return this.feed.createAnnouncement(user.tenantId, { userId: user.id, name: displayName(user) }, dto);
  }

  @Post('feed/posts/:id/like')
  @RequirePermission('hr:feed:read')
  toggleLike(@CurrentUser() user: any, @Param('id') id: string) {
    return this.feed.toggleLike(user.tenantId, id, user.id);
  }

  @Post('feed/posts/:id/vote')
  @RequirePermission('hr:feed:read')
  vote(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { optionId: string }) {
    return this.feed.vote(user.tenantId, id, user.id, body?.optionId);
  }

  @Get('feed/posts/:id/comments')
  @RequirePermission('hr:feed:read')
  listComments(@CurrentUser() user: any, @Param('id') id: string) {
    return this.feed.listComments(user.tenantId, id);
  }

  @Post('feed/posts/:id/comments')
  @RequirePermission('hr:feed:read')
  addComment(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { body: string }) {
    return this.feed.addComment(user.tenantId, id, { userId: user.id, name: displayName(user) }, body?.body);
  }

  @Patch('feed/posts/:id/pin')
  @RequirePermission('hr:feed:manage')
  pin(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { pinned: boolean }) {
    return this.feed.setPinned(user.tenantId, id, body?.pinned ?? true);
  }

  // Own posts only.
  @Delete('feed/posts/:id')
  @RequirePermission('hr:feed:read')
  deleteOwnPost(@CurrentUser() user: any, @Param('id') id: string) {
    return this.feed.deletePost(user.tenantId, id, user.id, false);
  }

  // Moderators can remove any post.
  @Delete('feed/posts/:id/moderate')
  @RequirePermission('hr:feed:manage')
  moderatePost(@CurrentUser() user: any, @Param('id') id: string) {
    return this.feed.deletePost(user.tenantId, id, user.id, true);
  }

  @Post('feed/posts/:id/report')
  @RequirePermission('hr:feed:read')
  reportPost(@CurrentUser() user: any, @Param('id') id: string) {
    return this.feed.reportPost(user.tenantId, id, user.id);
  }

  @Get('feed/moderation/queue')
  @RequirePermission('hr:feed:manage')
  moderationQueue(@CurrentUser() user: any, @Query('groupId') groupId?: string) {
    return this.feed.moderationQueue(user.tenantId, groupId);
  }

  @Post('feed/posts/:id/moderation/:decision')
  @RequirePermission('hr:feed:manage')
  moderateDecision(@CurrentUser() user: any, @Param('id') id: string, @Param('decision') decision: 'approve' | 'reject') {
    return this.feed.moderate(user.tenantId, id, decision);
  }

  // ─── Groups ───────────────────────────────────────────────────

  @Get('groups')
  @RequirePermission('hr:feed:read')
  listGroups(@CurrentUser() user: any, @Query('mine') mine?: string) {
    return this.groups.listGroups(user.tenantId, mine === 'true' ? user.id : undefined);
  }

  @Post('groups')
  @RequirePermission('hr:feed:read')
  createGroup(@CurrentUser() user: any, @Body() dto: any) {
    return this.groups.createGroup(user.tenantId, user.id, dto);
  }

  @Post('groups/:id/join')
  @RequirePermission('hr:feed:read')
  joinGroup(@CurrentUser() user: any, @Param('id') id: string) {
    return this.groups.join(user.tenantId, id, user.id);
  }

  @Post('groups/:id/leave')
  @RequirePermission('hr:feed:read')
  leaveGroup(@CurrentUser() user: any, @Param('id') id: string) {
    return this.groups.leave(user.tenantId, id, user.id);
  }

  @Delete('groups/:id')
  @RequirePermission('hr:feed:read')
  archiveGroup(@CurrentUser() user: any, @Param('id') id: string) {
    return this.groups.archive(user.tenantId, id, user.id);
  }

  // ─── Recognition programs (nominations) ───────────────────────

  @Get('recognition/programs')
  @RequirePermission('hr:recognition:read')
  listPrograms(@CurrentUser() user: any, @Query('status') status?: NominationProgramStatus) {
    return this.nominations.listPrograms(user.tenantId, status);
  }

  @Post('recognition/programs')
  @RequirePermission('hr:recognition:manage')
  createProgram(@CurrentUser() user: any, @Body() dto: any) {
    return this.nominations.createProgram(user.tenantId, dto);
  }

  @Patch('recognition/programs/:id/close')
  @RequirePermission('hr:recognition:manage')
  closeProgram(@CurrentUser() user: any, @Param('id') id: string) {
    return this.nominations.closeProgram(user.tenantId, id);
  }

  @Get('recognition/programs/:id/nominations')
  @RequirePermission('hr:recognition:read')
  listNominations(@CurrentUser() user: any, @Param('id') id: string) {
    return this.nominations.listNominations(user.tenantId, id);
  }

  @Post('recognition/nominations')
  @RequirePermission('hr:recognition:read')
  nominate(@CurrentUser() user: any, @Body() dto: any) {
    return this.nominations.nominate(user.tenantId, { userId: user.id, name: displayName(user) }, dto);
  }

  @Post('recognition/nominations/:id/vote')
  @RequirePermission('hr:recognition:read')
  voteNomination(@CurrentUser() user: any, @Param('id') id: string) {
    return this.nominations.vote(user.tenantId, id, user.id);
  }

  @Post('recognition/nominations/:id/decide/:decision')
  @RequirePermission('hr:recognition:manage')
  decideNomination(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('decision') decision: 'approve' | 'reject',
  ) {
    return this.nominations.decide(user.tenantId, id, decision, (r) =>
      this.recognition.give(user.tenantId, { userId: user.id, name: displayName(user) }, r),
    );
  }
}
