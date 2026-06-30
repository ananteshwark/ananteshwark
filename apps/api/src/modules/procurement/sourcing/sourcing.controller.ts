import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SourcingService } from './sourcing.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('procurement-sourcing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/sourcing')
export class SourcingController {
  constructor(private readonly service: SourcingService) {}

  // ─── Ph-198: events + lines ───────────────────────────────────────
  @Get('events')
  @RequirePermission('procurement:read')
  listEvents(@CurrentUser() u: any) { return this.service.listEvents(u.tenantId); }

  @Post('events')
  @RequirePermission('procurement:manage')
  @ApiOperation({ summary: 'Create a sourcing event (RFI/RFQ/Auction)' })
  createEvent(@CurrentUser() u: any, @Body() b: any) { return this.service.createEvent(u.tenantId, b); }

  @Get('events/:id/lines')
  @RequirePermission('procurement:read')
  listLines(@CurrentUser() u: any, @Param('id') id: string) { return this.service.listLines(u.tenantId, id); }

  @Post('events/:id/lines')
  @RequirePermission('procurement:manage')
  addLine(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.addLine(u.tenantId, id, b); }

  @Post('events/:id/publish')
  @RequirePermission('procurement:manage')
  publish(@CurrentUser() u: any, @Param('id') id: string) { return this.service.publish(u.tenantId, id); }

  // ─── Ph-199: bids + re-round ──────────────────────────────────────
  @Post('events/:id/bids')
  @RequirePermission('procurement:manage')
  @ApiOperation({ summary: 'Submit a supplier line bid' })
  submitBid(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.submitBid(u.tenantId, id, b); }

  @Get('events/:id/bids')
  @RequirePermission('procurement:read')
  @ApiQuery({ name: 'lineId', required: false })
  listBids(@CurrentUser() u: any, @Param('id') id: string, @Query('lineId') lineId?: string) { return this.service.listBids(u.tenantId, id, lineId); }

  @Post('events/:id/next-round')
  @RequirePermission('procurement:manage')
  @ApiOperation({ summary: 'Open a new bidding round (re-round)' })
  nextRound(@CurrentUser() u: any, @Param('id') id: string) { return this.service.startNextRound(u.tenantId, id); }

  // ─── Ph-200: scoring & award ──────────────────────────────────────
  @Get('events/:id/lines/:lineId/score')
  @RequirePermission('procurement:read')
  @ApiOperation({ summary: 'Weighted score of a line\'s bids with award recommendation' })
  scoreLine(@CurrentUser() u: any, @Param('id') id: string, @Param('lineId') lineId: string) { return this.service.scoreLine(u.tenantId, id, lineId); }

  @Post('events/:id/lines/:lineId/award')
  @RequirePermission('procurement:manage')
  @ApiOperation({ summary: 'Award a line to one or more suppliers (split-award)' })
  awardLine(@CurrentUser() u: any, @Param('id') id: string, @Param('lineId') lineId: string, @Body() b: { awards: any[] }) {
    return this.service.awardLine(u.tenantId, id, lineId, b.awards);
  }

  @Get('events/:id/awards')
  @RequirePermission('procurement:read')
  listAwards(@CurrentUser() u: any, @Param('id') id: string) { return this.service.listAwards(u.tenantId, id); }

  // ─── Ph-201: award-to-PO ──────────────────────────────────────────
  @Post('events/:id/award-to-po')
  @RequirePermission('procurement:manage')
  @ApiOperation({ summary: 'Convert awarded lines into PO proposals per supplier' })
  awardToPo(@CurrentUser() u: any, @Param('id') id: string) { return this.service.awardToPo(u.tenantId, id); }
}
