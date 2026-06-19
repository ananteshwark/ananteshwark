import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GoalsService } from './goals.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreateCycleDto, CreateObjectiveDto, CreateKeyResultDto, UpdateKrProgressDto } from './dto/goals.dto';

@ApiTags('talent-goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('talent/goals')
export class GoalsController {
  constructor(private readonly service: GoalsService) {}

  @Get('cycles')
  @RequirePermission('talent:goals:read')
  listCycles(@CurrentUser() user: any) {
    return this.service.listCycles(user.tenantId);
  }

  @Post('cycles')
  @RequirePermission('talent:goals:manage')
  createCycle(@CurrentUser() user: any, @Body() dto: CreateCycleDto) {
    return this.service.createCycle(user.tenantId, dto);
  }

  @Get('cycles/:cycleId/dashboard')
  @RequirePermission('talent:goals:read')
  getDashboard(@CurrentUser() user: any, @Param('cycleId') cycleId: string) {
    return this.service.getDashboard(user.tenantId, cycleId);
  }

  @Get('objectives')
  @RequirePermission('talent:goals:read')
  listObjectives(@CurrentUser() user: any, @Query('cycleId') cycleId?: string) {
    return this.service.listObjectives(user.tenantId, cycleId);
  }

  @Post('objectives')
  @RequirePermission('talent:goals:create')
  createObjective(@CurrentUser() user: any, @Body() dto: CreateObjectiveDto) {
    return this.service.createObjective(user.tenantId, dto);
  }

  @Get('objectives/:objectiveId/key-results')
  @RequirePermission('talent:goals:read')
  listKeyResults(@CurrentUser() user: any, @Param('objectiveId') objectiveId: string) {
    return this.service.listKeyResults(user.tenantId, objectiveId);
  }

  @Post('key-results')
  @RequirePermission('talent:goals:create')
  createKeyResult(@CurrentUser() user: any, @Body() dto: CreateKeyResultDto) {
    return this.service.createKeyResult(user.tenantId, dto);
  }

  @Post('key-results/:id/progress')
  @RequirePermission('talent:goals:create')
  updateProgress(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateKrProgressDto) {
    return this.service.updateKeyResultProgress(user.tenantId, id, dto);
  }
}
