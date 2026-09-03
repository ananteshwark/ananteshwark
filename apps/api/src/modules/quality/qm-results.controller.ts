import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { QmResultsService } from './qm-results.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreateCharacteristicDto, UpdateCharacteristicDto,
  RecordInspectionResultsDto, SetUsageDecisionDto,
} from './dto/quality.dto';

@ApiTags('quality')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('quality')
export class QmResultsController {
  constructor(private readonly service: QmResultsService) {}

  // ---- Characteristics ----
  @Get('plans/:planId/characteristics')
  @RequirePermission('quality:read')
  listCharacteristics(@CurrentUser() user: any, @Param('planId') planId: string) {
    return this.service.listCharacteristics(user.tenantId, planId);
  }

  @Post('plans/:planId/characteristics')
  @RequirePermission('quality:manage')
  createCharacteristic(@CurrentUser() user: any, @Param('planId') planId: string, @Body() dto: CreateCharacteristicDto) {
    return this.service.createCharacteristic(user.tenantId, planId, dto);
  }

  @Patch('characteristics/:id')
  @RequirePermission('quality:manage')
  updateCharacteristic(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateCharacteristicDto) {
    return this.service.updateCharacteristic(user.tenantId, id, dto);
  }

  @Delete('characteristics/:id')
  @RequirePermission('quality:manage')
  deleteCharacteristic(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteCharacteristic(user.tenantId, id);
  }

  // ---- Results ----
  @Get('lots/:lotId/results')
  @RequirePermission('quality:read')
  getLotResults(@CurrentUser() user: any, @Param('lotId') lotId: string) {
    return this.service.getLotResults(user.tenantId, lotId);
  }

  @Post('lots/:lotId/results')
  @RequirePermission('quality:manage')
  recordResults(@CurrentUser() user: any, @Param('lotId') lotId: string, @Body() dto: RecordInspectionResultsDto) {
    return this.service.recordResults(user.tenantId, lotId, dto, user.id);
  }

  @Post('lots/:lotId/usage-decision')
  @RequirePermission('quality:manage')
  setUsageDecision(@CurrentUser() user: any, @Param('lotId') lotId: string, @Body() dto: SetUsageDecisionDto) {
    return this.service.setUsageDecision(user.tenantId, lotId, dto, user.id);
  }
}
