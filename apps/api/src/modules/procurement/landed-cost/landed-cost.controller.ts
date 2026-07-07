import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { LandedCostService } from './landed-cost.service';

@ApiTags('landed-cost')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/landed-costs')
export class LandedCostController {
  constructor(private readonly service: LandedCostService) {}

  @Get()
  @RequirePermission('procurement:read')
  findAll(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.findAll(user.tenantId, pagination);
  }

  @Post()
  @RequirePermission('procurement:write')
  @ApiOperation({ summary: 'Allocate freight/duty/insurance charges over a GRN' })
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.create(user.tenantId, dto);
  }

  @Get(':id')
  @RequirePermission('procurement:read')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findOne(user.tenantId, id);
  }

  @Patch(':id/post')
  @RequirePermission('procurement:write')
  post(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.post(user.tenantId, id);
  }

  @Patch(':id/cancel')
  @RequirePermission('procurement:write')
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancel(user.tenantId, id);
  }
}
