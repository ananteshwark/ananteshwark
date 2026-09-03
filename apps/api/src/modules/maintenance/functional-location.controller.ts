import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FunctionalLocationService } from './functional-location.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreateFunctionalLocationDto, UpdateFunctionalLocationDto, CreateCounterReadingDto,
} from './dto/maintenance.dto';

@ApiTags('maintenance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('maintenance')
export class FunctionalLocationController {
  constructor(private readonly service: FunctionalLocationService) {}

  // ---- Functional Locations ----
  @Get('functional-locations/tree')
  @RequirePermission('maintenance:read')
  getTree(@CurrentUser() user: any) {
    return this.service.getTree(user.tenantId);
  }

  @Get('functional-locations')
  @RequirePermission('maintenance:read')
  list(@CurrentUser() user: any) {
    return this.service.list(user.tenantId);
  }

  @Post('functional-locations')
  @RequirePermission('maintenance:manage')
  create(@CurrentUser() user: any, @Body() dto: CreateFunctionalLocationDto) {
    return this.service.create(user.tenantId, dto);
  }

  @Patch('functional-locations/:id')
  @RequirePermission('maintenance:manage')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateFunctionalLocationDto) {
    return this.service.update(user.tenantId, id, dto);
  }

  @Delete('functional-locations/:id')
  @RequirePermission('maintenance:manage')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.remove(user.tenantId, id);
  }

  // ---- Counter Readings ----
  @Get('equipment/:id/counter-readings')
  @RequirePermission('maintenance:read')
  listReadings(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.listReadings(user.tenantId, id);
  }

  @Post('equipment/:id/counter-readings')
  @RequirePermission('maintenance:manage')
  recordReading(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CreateCounterReadingDto) {
    return this.service.recordCounterReading(user.tenantId, id, dto, user.id);
  }

  // ---- Due Plans (counter + time based) ----
  @Get('due-plans')
  @RequirePermission('maintenance:read')
  getDuePlans(@CurrentUser() user: any) {
    return this.service.getDuePlans(user.tenantId);
  }
}
