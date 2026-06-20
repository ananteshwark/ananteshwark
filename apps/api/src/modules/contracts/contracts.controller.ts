import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateContractDto, UpdateContractDto, CreateMilestoneDto, CreateTemplateDto } from './dto/contracts.dto';

@ApiTags('contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get()
  @RequirePermission('contracts:read')
  listContracts(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.listContracts(user.tenantId, pagination, { type, status, search });
  }

  @Get('expiring')
  @RequirePermission('contracts:read')
  getExpiring(@CurrentUser() user: any, @Query('days') days?: string) {
    return this.service.getExpiringContracts(user.tenantId, days ? parseInt(days) : 30);
  }

  @Get(':id')
  @RequirePermission('contracts:read')
  getContract(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findContract(user.tenantId, id);
  }

  @Post()
  @RequirePermission('contracts:manage')
  createContract(@CurrentUser() user: any, @Body() dto: CreateContractDto) {
    return this.service.createContract(user.tenantId, dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('contracts:manage')
  updateContract(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.service.updateContract(user.tenantId, id, dto);
  }

  @Post(':id/activate')
  @RequirePermission('contracts:manage')
  activate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.activateContract(user.tenantId, id);
  }

  @Post(':id/terminate')
  @RequirePermission('contracts:manage')
  terminate(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.service.terminateContract(user.tenantId, id, body.reason);
  }

  @Post(':id/renew')
  @RequirePermission('contracts:manage')
  renew(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { newEndDate: string }) {
    return this.service.renewContract(user.tenantId, id, body.newEndDate);
  }

  // Milestones
  @Get(':id/milestones')
  @RequirePermission('contracts:read')
  listMilestones(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.listMilestones(user.tenantId, id);
  }

  @Post(':id/milestones')
  @RequirePermission('contracts:manage')
  createMilestone(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CreateMilestoneDto) {
    return this.service.createMilestone(user.tenantId, id, dto);
  }

  @Post('milestones/:milestoneId/complete')
  @RequirePermission('contracts:manage')
  completeMilestone(@CurrentUser() user: any, @Param('milestoneId') id: string) {
    return this.service.completeMilestone(user.tenantId, id);
  }

  // Templates
  @Get('templates')
  @RequirePermission('contracts:read')
  listTemplates(@CurrentUser() user: any, @Query('type') type?: string) {
    return this.service.listTemplates(user.tenantId, type as any);
  }

  @Post('templates')
  @RequirePermission('contracts:manage')
  createTemplate(@CurrentUser() user: any, @Body() dto: CreateTemplateDto) {
    return this.service.createTemplate(user.tenantId, dto);
  }
}
