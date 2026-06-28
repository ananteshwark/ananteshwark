import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LdgService } from './ldg.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('payroll-ldg')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('payroll/ldg')
export class LdgController {
  constructor(private readonly service: LdgService) {}

  @Get()
  @RequirePermission('payroll:read')
  list(@CurrentUser() u: any) { return this.service.list(u.tenantId); }

  @Get('resolve')
  @RequirePermission('payroll:read')
  @ApiOperation({ summary: 'Resolve the active LDG for a country' })
  @ApiQuery({ name: 'countryCode', required: true })
  resolve(@CurrentUser() u: any, @Query('countryCode') countryCode: string) {
    return this.service.resolveForCountry(u.tenantId, countryCode);
  }

  @Post()
  @RequirePermission('payroll:manage')
  @ApiOperation({ summary: 'Create a Legislative Data Group' })
  create(@CurrentUser() u: any, @Body() b: any) { return this.service.create(u.tenantId, b); }

  @Patch(':id')
  @RequirePermission('payroll:manage')
  update(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.update(u.tenantId, id, b); }

  @Post('seed-defaults')
  @RequirePermission('payroll:manage')
  @ApiOperation({ summary: 'Seed reference LDGs for India / UK / US' })
  seed(@CurrentUser() u: any) { return this.service.seedDefaults(u.tenantId); }
}
