import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { KnowledgeService } from './knowledge.service';
import { KbArticleStatus, EmailIntakeStatus } from './entities/knowledge.entity';

@ApiTags('knowledge-base')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly service: KnowledgeService) {}

  // ---- Categories ----
  @Get('categories')
  @RequirePermission('knowledge:read')
  listCategories(@CurrentUser() user: any) {
    return this.service.listCategories(user.tenantId);
  }

  @Post('categories')
  @RequirePermission('knowledge:manage')
  createCategory(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createCategory(user.tenantId, dto);
  }

  // ---- Articles ----
  @Get('articles')
  @RequirePermission('knowledge:read')
  listArticles(@CurrentUser() user: any, @Query('status') status?: KbArticleStatus, @Query('categoryId') categoryId?: string) {
    return this.service.listArticles(user.tenantId, { status, categoryId });
  }

  @Post('articles')
  @RequirePermission('knowledge:manage')
  createArticle(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createArticle(user.tenantId, user.id, dto);
  }

  @Get('articles/:id')
  @RequirePermission('knowledge:read')
  getArticle(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getArticle(user.tenantId, id);
  }

  @Patch('articles/:id')
  @RequirePermission('knowledge:manage')
  @ApiOperation({ summary: 'Edit an article; editing a published one mints a new draft version' })
  updateArticle(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateArticle(user.tenantId, id, dto);
  }

  @Post('articles/:id/publish')
  @RequirePermission('knowledge:manage')
  publish(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.publish(user.tenantId, id);
  }

  @Post('articles/:id/archive')
  @RequirePermission('knowledge:manage')
  archive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.archive(user.tenantId, id);
  }

  @Post('articles/:id/view')
  @RequirePermission('knowledge:read')
  recordView(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.recordView(user.tenantId, id);
  }

  @Post('articles/:id/vote')
  @RequirePermission('knowledge:read')
  vote(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { helpful: boolean }) {
    return this.service.vote(user.tenantId, id, !!body?.helpful);
  }

  @Get('search')
  @RequirePermission('knowledge:read')
  @ApiOperation({ summary: 'Rank published articles for a query (also used for ticket deflection)' })
  search(@CurrentUser() user: any, @Query('q') q: string) {
    return this.service.search(user.tenantId, q);
  }

  // ---- Email-to-ticket ----
  @Post('email-intake')
  @RequirePermission('knowledge:intake')
  @ApiOperation({ summary: 'Ingest an inbound support email (deduped by message id)' })
  ingestEmail(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.ingestEmail(user.tenantId, dto);
  }

  @Get('email-intake')
  @RequirePermission('knowledge:intake')
  listIntakes(@CurrentUser() user: any, @Query('status') status?: EmailIntakeStatus) {
    return this.service.listIntakes(user.tenantId, status);
  }

  @Post('email-intake/:id/convert')
  @RequirePermission('knowledge:intake')
  @ApiOperation({ summary: 'Convert an inbound email into a helpdesk case' })
  convert(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { employeeId?: string }) {
    return this.service.convertToTicket(user.tenantId, id, user.id, { employeeId: body?.employeeId });
  }

  @Post('email-intake/:id/ignore')
  @RequirePermission('knowledge:intake')
  ignore(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.ignoreIntake(user.tenantId, id);
  }
}
