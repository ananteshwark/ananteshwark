import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PolicyService } from './policy.service';
import { PolicyStatus } from './policy.entity';

@ApiTags('hr-policies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/policies')
export class PolicyController {
  constructor(private readonly service: PolicyService) {}

  @Get()
  @RequirePermission('hr:policies:read')
  list(@CurrentUser() user: any, @Query('category') category?: string, @Query('status') status?: PolicyStatus) {
    return this.service.list(user.tenantId, { category, status });
  }

  @Get(':id')
  @RequirePermission('hr:policies:read')
  get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.get(user.tenantId, id);
  }

  @Post()
  @RequirePermission('hr:policies:manage')
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.create(user.tenantId, user.id, dto);
  }

  @Patch(':id')
  @RequirePermission('hr:policies:manage')
  @ApiOperation({ summary: 'Edit a policy; editing a published one mints a new version' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.update(user.tenantId, id, dto);
  }

  @Post(':id/publish')
  @RequirePermission('hr:policies:manage')
  publish(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.publish(user.tenantId, id);
  }

  @Post(':id/archive')
  @RequirePermission('hr:policies:manage')
  archive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.archive(user.tenantId, id);
  }

  // ---- Acknowledgements ----
  @Post(':id/acknowledge')
  @RequirePermission('hr:policies:read')
  @ApiOperation({ summary: 'Acknowledge the current published version of a policy' })
  acknowledge(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { employeeId: string }) {
    return this.service.acknowledge(user.tenantId, id, { employeeId: body?.employeeId, userId: user.id });
  }

  @Get(':id/acknowledgement-status')
  @RequirePermission('hr:policies:read')
  acknowledgementStatus(@CurrentUser() user: any, @Param('id') id: string, @Query('employeeId') employeeId: string) {
    return this.service.acknowledgementStatus(user.tenantId, id, employeeId);
  }

  @Get(':id/acknowledgements')
  @RequirePermission('hr:policies:manage')
  acknowledgements(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.acknowledgements(user.tenantId, id);
  }
}
