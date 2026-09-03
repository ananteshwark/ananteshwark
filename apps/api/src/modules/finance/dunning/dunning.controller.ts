import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DunningService } from './dunning.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateDunningLevelDto, UpdateDunningLevelDto, RunDunningDto, CreatePaymentPlanDto } from './dto/dunning.dto';

@ApiTags('dunning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/dunning')
export class DunningController {
  constructor(private readonly service: DunningService) {}

  @Get('levels')
  @RequirePermission('finance:ar:read')
  listLevels(@CurrentUser() user: any) {
    return this.service.listLevels(user.tenantId);
  }

  @Post('levels')
  @RequirePermission('finance:ar:manage')
  createLevel(@CurrentUser() user: any, @Body() dto: CreateDunningLevelDto) {
    return this.service.createLevel(user.tenantId, dto);
  }

  @Patch('levels/:id')
  @RequirePermission('finance:ar:manage')
  updateLevel(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateDunningLevelDto) {
    return this.service.updateLevel(user.tenantId, id, dto);
  }

  @Get('runs')
  @RequirePermission('finance:ar:read')
  listRuns(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listRuns(user.tenantId, pagination);
  }

  @Post('runs')
  @RequirePermission('finance:ar:manage')
  runDunning(@CurrentUser() user: any, @Body() dto: RunDunningDto) {
    return this.service.runDunning(user.tenantId, dto);
  }

  @Post('runs/:id/send')
  @RequirePermission('finance:ar:manage')
  sendRun(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.sendDunningRun(user.tenantId, id);
  }

  @Get('runs/:id/letters')
  @RequirePermission('finance:ar:read')
  getLetters(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getRunLetters(user.tenantId, id);
  }

  @Get('payment-plans')
  @RequirePermission('finance:ar:read')
  listPlans(@CurrentUser() user: any, @Query('customerId') customerId?: string) {
    return this.service.listPaymentPlans(user.tenantId, customerId);
  }

  @Post('payment-plans')
  @RequirePermission('finance:ar:manage')
  createPlan(@CurrentUser() user: any, @Body() dto: CreatePaymentPlanDto) {
    return this.service.createPaymentPlan(user.tenantId, dto);
  }

  @Post('payment-plans/:id/installments/:index/pay')
  @RequirePermission('finance:ar:manage')
  payInstallment(@CurrentUser() user: any, @Param('id') id: string, @Param('index') index: string) {
    return this.service.recordInstallmentPaid(user.tenantId, id, parseInt(index));
  }
}
