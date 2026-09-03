import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ConsolidationService } from './consolidation.service';
import {
  CreateConsolidationGroupDto,
  UpdateConsolidationGroupDto,
  RunConsolidationDto,
} from './dto/consolidation.dto';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('finance/consolidation')
export class ConsolidationController {
  constructor(private readonly svc: ConsolidationService) {}

  // ─── Groups ─────────────────────────────────────────────────────────────────

  @Get('groups')
  @RequirePermission('finance.consolidation.read')
  listGroups(@CurrentUser() user: { tenantId: string }) {
    return this.svc.listGroups(user.tenantId);
  }

  @Post('groups')
  @RequirePermission('finance.consolidation.write')
  createGroup(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: CreateConsolidationGroupDto,
  ) {
    return this.svc.createGroup(user.tenantId, dto);
  }

  @Get('groups/:id')
  @RequirePermission('finance.consolidation.read')
  getGroup(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getGroup(user.tenantId, id);
  }

  @Patch('groups/:id')
  @RequirePermission('finance.consolidation.write')
  updateGroup(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConsolidationGroupDto,
  ) {
    return this.svc.updateGroup(user.tenantId, id, dto);
  }

  // ─── Runs ────────────────────────────────────────────────────────────────────

  @Get('runs')
  @RequirePermission('finance.consolidation.read')
  listRuns(
    @CurrentUser() user: { tenantId: string },
    @Query('groupId') groupId?: string,
  ) {
    return this.svc.listRuns(user.tenantId, groupId);
  }

  @Get('runs/:id')
  @RequirePermission('finance.consolidation.read')
  getRun(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getRun(user.tenantId, id);
  }

  @Post('run')
  @RequirePermission('finance.consolidation.write')
  runConsolidation(
    @CurrentUser() user: { tenantId: string; id: string },
    @Body() dto: RunConsolidationDto,
  ) {
    return this.svc.runConsolidation(user.tenantId, dto, user.id);
  }
}
