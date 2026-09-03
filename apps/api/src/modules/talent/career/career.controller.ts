import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CareerService } from './career.service';
import { TalentPoolType, PoolMemberStatus } from './entities/talent-pool.entity';
import { TalentReviewStatus, Rating3 } from './entities/talent-review.entity';

@ApiTags('talent-career')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('talent/career')
export class CareerController {
  constructor(private readonly service: CareerService) {}

  // ---- Career architecture ----
  @Get('families')
  @RequirePermission('talent:career:read')
  listFamilies(@CurrentUser() user: any) {
    return this.service.listJobFamilies(user.tenantId);
  }

  @Post('families')
  @RequirePermission('talent:career:manage')
  createFamily(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createJobFamily(user.tenantId, dto);
  }

  @Patch('families/:id')
  @RequirePermission('talent:career:manage')
  updateFamily(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateJobFamily(user.tenantId, id, dto);
  }

  @Get('ladders')
  @RequirePermission('talent:career:read')
  listLadders(@CurrentUser() user: any, @Query('jobFamilyId') jobFamilyId?: string) {
    return this.service.listLadders(user.tenantId, jobFamilyId);
  }

  @Post('ladders')
  @RequirePermission('talent:career:manage')
  createLadder(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createLadder(user.tenantId, dto);
  }

  @Patch('ladders/:id/rungs')
  @RequirePermission('talent:career:manage')
  @ApiOperation({ summary: 'Replace a ladder\'s rungs (levels)' })
  setRungs(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { rungs: any[] }) {
    return this.service.setLadderRungs(user.tenantId, id, body?.rungs ?? []);
  }

  @Post('paths')
  @RequirePermission('talent:career:manage')
  createPath(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createPath(user.tenantId, dto);
  }

  @Get('ladders/:id/next-moves')
  @RequirePermission('talent:career:read')
  @ApiOperation({ summary: 'Reachable career moves from a ladder level' })
  nextMoves(@CurrentUser() user: any, @Param('id') id: string, @Query('level') level: string) {
    return this.service.nextMoves(user.tenantId, id, Number(level));
  }

  // ---- Talent pools ----
  @Get('pools')
  @RequirePermission('talent:pools:read')
  listPools(@CurrentUser() user: any, @Query('type') type?: TalentPoolType) {
    return this.service.listPools(user.tenantId, type);
  }

  @Post('pools')
  @RequirePermission('talent:pools:manage')
  createPool(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createPool(user.tenantId, dto);
  }

  @Get('pools/:id')
  @RequirePermission('talent:pools:read')
  getPool(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getPool(user.tenantId, id);
  }

  @Get('pools/:id/members')
  @RequirePermission('talent:pools:read')
  listMembers(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.listMembers(user.tenantId, id);
  }

  @Post('pools/:id/members')
  @RequirePermission('talent:pools:manage')
  nominateMember(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.nominateMember(user.tenantId, id, { ...dto, nominatedByUserId: user.id });
  }

  @Patch('members/:memberId')
  @RequirePermission('talent:pools:manage')
  updateMember(@CurrentUser() user: any, @Param('memberId') memberId: string, @Body() dto: { status?: PoolMemberStatus; readiness?: string; rationale?: string }) {
    return this.service.updateMember(user.tenantId, memberId, dto);
  }

  @Get('pools/:id/coverage')
  @RequirePermission('talent:pools:read')
  @ApiOperation({ summary: 'Bench-strength / coverage view for a pool' })
  poolCoverage(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.poolCoverage(user.tenantId, id);
  }

  // ---- Talent reviews (9-box) ----
  @Get('reviews')
  @RequirePermission('talent:reviews:read')
  listReviews(@CurrentUser() user: any, @Query('status') status?: TalentReviewStatus) {
    return this.service.listReviews(user.tenantId, status);
  }

  @Post('reviews')
  @RequirePermission('talent:reviews:manage')
  createReview(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createReview(user.tenantId, dto);
  }

  @Get('reviews/:id')
  @RequirePermission('talent:reviews:read')
  getReview(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getReview(user.tenantId, id);
  }

  @Get('reviews/:id/placements')
  @RequirePermission('talent:reviews:read')
  listPlacements(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.listPlacements(user.tenantId, id);
  }

  @Post('reviews/:id/placements')
  @RequirePermission('talent:reviews:calibrate')
  @ApiOperation({ summary: 'Place/re-place an employee on the 9-box grid' })
  placeEmployee(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { employeeId: string; employeeName: string; performance: Rating3; potential: Rating3; flightRisk?: string; impactOfLoss?: string; notes?: string }) {
    return this.service.placeEmployee(user.tenantId, id, dto);
  }

  @Get('reviews/:id/distribution')
  @RequirePermission('talent:reviews:read')
  distribution(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.distribution(user.tenantId, id);
  }

  @Post('reviews/:id/start-calibration')
  @RequirePermission('talent:reviews:manage')
  startCalibration(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.startCalibration(user.tenantId, id);
  }

  @Post('reviews/:id/finalize')
  @RequirePermission('talent:reviews:manage')
  @ApiOperation({ summary: 'Finalize the review and flow top-box talent into the HiPo pool' })
  finalize(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.finalize(user.tenantId, id);
  }
}
