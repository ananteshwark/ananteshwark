import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { BgvService } from './bgv.service';
import { BgvCaseStatus, BgvSubjectType } from './entities/bgv.entity';

@ApiTags('bgv')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('bgv')
export class BgvController {
  constructor(private readonly service: BgvService) {}

  @Get('cases')
  @RequirePermission('talent:bgv:read')
  listCases(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('status') status?: BgvCaseStatus,
    @Query('subjectType') subjectType?: BgvSubjectType,
  ) {
    return this.service.listCases(user.tenantId, pagination, { status, subjectType });
  }

  @Post('cases')
  @RequirePermission('talent:bgv:manage')
  initiate(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.initiate(user.tenantId, user.id, dto);
  }

  @Get('cases/:id')
  @RequirePermission('talent:bgv:read')
  getCase(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getCase(user.tenantId, id);
  }

  @Patch('checks/:id')
  @RequirePermission('talent:bgv:manage')
  updateCheck(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateCheck(user.tenantId, id, user.id, dto);
  }

  @Patch('cases/:id/cancel')
  @RequirePermission('talent:bgv:manage')
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancel(user.tenantId, id);
  }
}
