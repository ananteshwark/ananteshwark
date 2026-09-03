import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApprovalMatrixService, StartForDocumentInput } from './approval-matrix.service';

@ApiTags('approval-matrix')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('workflow/approval-matrix')
export class ApprovalMatrixController {
  constructor(private readonly service: ApprovalMatrixService) {}

  @Get('rules')
  @RequirePermission('workflow:definitions:read')
  list(@CurrentUser() user: any, @Query('docType') docType?: string) {
    return this.service.listRules(user.tenantId, docType);
  }

  @Post('rules')
  @RequirePermission('workflow:definitions:create')
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createRule(user.tenantId, dto);
  }

  @Patch('rules/:id')
  @RequirePermission('workflow:definitions:create')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateRule(user.tenantId, id, dto);
  }

  @Delete('rules/:id')
  @RequirePermission('workflow:definitions:create')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteRule(user.tenantId, id);
  }

  @Get('resolve')
  @RequirePermission('workflow:definitions:read')
  @ApiOperation({ summary: 'Preview which rule a document would route to' })
  resolve(
    @CurrentUser() user: any,
    @Query('docType') docType: string,
    @Query('amount') amount: string,
    @Query('orgUnitId') orgUnitId?: string,
  ) {
    return this.service.resolve(user.tenantId, docType, Number(amount), orgUnitId);
  }

  @Post('start')
  @RequirePermission('workflow:instances:read')
  @ApiOperation({ summary: 'Route a document into approval via the matrix' })
  start(@CurrentUser() user: any, @Body() dto: StartForDocumentInput) {
    return this.service.startForDocument(user.tenantId, user.id, dto);
  }
}
