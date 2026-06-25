import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SourceDeterminationService } from './source-determination.service';
import {
  CreateSourceListDto,
  UpdateSourceListDto,
  CreateQuotaArrangementDto,
  UpdateQuotaArrangementDto,
  DetermineSourceDto,
} from './dto/source-determination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('procurement/source-determination')
@UseGuards(JwtAuthGuard, RbacGuard)
export class SourceDeterminationController {
  constructor(private readonly svc: SourceDeterminationService) {}

  // ─── Source List ────────────────────────────────────────────────────────────

  @Get('source-lists')
  @RequirePermission('procurement:read')
  getSourceLists(
    @CurrentUser() user: any,
    @Query('itemId') itemId?: string,
    @Query('vendorId') vendorId?: string,
    @Query('asOf') asOf?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.svc.findSourceLists(user.tenantId, {
      itemId,
      vendorId,
      asOf,
      activeOnly: activeOnly === 'true',
    });
  }

  @Post('source-lists')
  @RequirePermission('procurement:write')
  createSourceList(@CurrentUser() user: any, @Body() dto: CreateSourceListDto) {
    return this.svc.createSourceList(user.tenantId, dto);
  }

  @Patch('source-lists/:id')
  @RequirePermission('procurement:write')
  updateSourceList(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSourceListDto,
  ) {
    return this.svc.updateSourceList(user.tenantId, id, dto);
  }

  @Delete('source-lists/:id')
  @RequirePermission('procurement:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSourceList(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.deleteSourceList(user.tenantId, id);
  }

  // ─── Quota Arrangements ─────────────────────────────────────────────────────

  @Get('quota-arrangements')
  @RequirePermission('procurement:read')
  getQuotaArrangements(
    @CurrentUser() user: any,
    @Query('itemId') itemId?: string,
    @Query('asOf') asOf?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.svc.findQuotaArrangements(user.tenantId, {
      itemId,
      asOf,
      activeOnly: activeOnly === 'true',
    });
  }

  @Post('quota-arrangements')
  @RequirePermission('procurement:write')
  createQuotaArrangement(@CurrentUser() user: any, @Body() dto: CreateQuotaArrangementDto) {
    return this.svc.createQuotaArrangement(user.tenantId, dto);
  }

  @Patch('quota-arrangements/:id')
  @RequirePermission('procurement:write')
  updateQuotaArrangement(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotaArrangementDto,
  ) {
    return this.svc.updateQuotaArrangement(user.tenantId, id, dto);
  }

  @Post('quota-arrangements/:id/reset-allocations')
  @RequirePermission('procurement:write')
  resetQuotaAllocations(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.resetQuotaAllocations(user.tenantId, id);
  }

  // ─── Source Determination ────────────────────────────────────────────────────

  @Post('determine')
  @RequirePermission('procurement:read')
  determineSource(@CurrentUser() user: any, @Body() dto: DetermineSourceDto) {
    return this.svc.determineSource(
      user.tenantId,
      dto.itemId,
      dto.quantity,
      dto.requiredDate,
    );
  }

  @Get('item/:itemId/sources')
  @RequirePermission('procurement:read')
  getItemSources(
    @CurrentUser() user: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query('quantity') quantity?: string,
    @Query('requiredDate') requiredDate?: string,
  ) {
    return this.svc.determineSource(
      user.tenantId,
      itemId,
      quantity ? parseFloat(quantity) : 1,
      requiredDate,
    );
  }
}
