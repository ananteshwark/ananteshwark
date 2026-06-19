import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SuccessionService } from './succession.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateSuccessionPlanDto, AddCandidateDto } from './dto/succession.dto';

@ApiTags('talent-succession')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('talent/succession')
export class SuccessionController {
  constructor(private readonly service: SuccessionService) {}

  @Get('plans')
  @RequirePermission('talent:succession:read')
  listPlans(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listPlans(user.tenantId, pagination);
  }

  @Get('plans/:id')
  @RequirePermission('talent:succession:read')
  getPlan(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getPlan(user.tenantId, id);
  }

  @Post('plans')
  @RequirePermission('talent:succession:manage')
  createPlan(@CurrentUser() user: any, @Body() dto: CreateSuccessionPlanDto) {
    return this.service.createPlan(user.tenantId, dto);
  }

  @Post('candidates')
  @RequirePermission('talent:succession:manage')
  addCandidate(@CurrentUser() user: any, @Body() dto: AddCandidateDto) {
    return this.service.addCandidate(user.tenantId, dto);
  }
}
