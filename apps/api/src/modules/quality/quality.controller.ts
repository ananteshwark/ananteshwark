import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { QualityService } from './quality.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreateInspectionPlanDto, CreateInspectionLotDto, RecordResultsDto,
  CreateNcrDto, ResolveNcrDto,
} from './dto/quality.dto';

@ApiTags('quality')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('quality')
export class QualityController {
  constructor(private readonly service: QualityService) {}

  // Inspection Plans
  @Get('inspection-plans')
  @RequirePermission('quality:read')
  listPlans(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listPlans(user.tenantId, pagination);
  }

  @Post('inspection-plans')
  @RequirePermission('quality:manage')
  createPlan(@CurrentUser() user: any, @Body() dto: CreateInspectionPlanDto) {
    return this.service.createPlan(user.tenantId, dto);
  }

  @Patch('inspection-plans/:id')
  @RequirePermission('quality:manage')
  updatePlan(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updatePlan(user.tenantId, id, dto);
  }

  @Get('inspection-plans/:id')
  @RequirePermission('quality:read')
  findPlan(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findPlan(user.tenantId, id);
  }

  // Inspection Lots
  @Get('inspection-lots')
  @RequirePermission('quality:read')
  listLots(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listLots(user.tenantId, pagination);
  }

  @Post('inspection-lots')
  @RequirePermission('quality:manage')
  createLot(@CurrentUser() user: any, @Body() dto: CreateInspectionLotDto) {
    return this.service.createLot(user.tenantId, dto);
  }

  @Get('inspection-lots/:id')
  @RequirePermission('quality:read')
  findLot(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findLot(user.tenantId, id);
  }

  @Post('inspection-lots/:id/record-results')
  @RequirePermission('quality:manage')
  recordResults(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RecordResultsDto) {
    return this.service.recordResults(user.tenantId, id, dto);
  }

  // NCRs
  @Get('ncrs')
  @RequirePermission('quality:read')
  listNcrs(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listNcrs(user.tenantId, pagination);
  }

  @Post('ncrs')
  @RequirePermission('quality:manage')
  createNcr(@CurrentUser() user: any, @Body() dto: CreateNcrDto) {
    return this.service.createNcr(user.tenantId, dto);
  }

  @Post('ncrs/:id/resolve')
  @RequirePermission('quality:manage')
  resolveNcr(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: ResolveNcrDto) {
    return this.service.resolveNcr(user.tenantId, id, dto);
  }

  @Post('ncrs/:id/close')
  @RequirePermission('quality:manage')
  closeNcr(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.closeNcr(user.tenantId, id);
  }
}
