import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LettersService } from './letters.service';

@ApiTags('letters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('letters')
export class LettersController {
  constructor(private readonly service: LettersService) {}

  // Templates
  @Get('templates')
  @RequirePermission('hr:letters:read')
  listTemplates(@CurrentUser() user: any, @Query('activeOnly') activeOnly?: string) {
    return this.service.listTemplates(user.tenantId, activeOnly === 'true');
  }

  @Post('templates')
  @RequirePermission('hr:letters:manage')
  createTemplate(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createTemplate(user.tenantId, dto);
  }

  @Patch('templates/:id')
  @RequirePermission('hr:letters:manage')
  updateTemplate(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateTemplate(user.tenantId, id, dto);
  }

  // Generation & issuance
  @Post('generate')
  @RequirePermission('hr:letters:manage')
  generate(@CurrentUser() user: any, @Body() dto: { templateId: string; employeeId: string; data?: Record<string, any> }) {
    return this.service.generate(user.tenantId, dto);
  }

  @Get('issued')
  @RequirePermission('hr:letters:read')
  listIssued(@CurrentUser() user: any, @Query('employeeId') employeeId?: string) {
    return this.service.listIssued(user.tenantId, employeeId);
  }

  @Get('issued/:id')
  @RequirePermission('hr:letters:read')
  getIssued(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getIssued(user.tenantId, id);
  }

  @Patch('issued/:id/issue')
  @RequirePermission('hr:letters:manage')
  issue(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.issue(user.tenantId, id, user.id);
  }

  @Patch('issued/:id/revoke')
  @RequirePermission('hr:letters:manage')
  revoke(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.revoke(user.tenantId, id);
  }
}
