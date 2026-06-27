import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { InventoryOrgService } from './inventory-org.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InterOrgStatus } from './entities/inter-org-transfer.entity';

@ApiTags('inventory-multiorg')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/orgs')
export class InventoryOrgController {
  constructor(private readonly service: InventoryOrgService) {}

  // ─── Ph-134: organizations ────────────────────────────────────────
  @Get()
  @RequirePermission('inventory:read')
  listOrgs(@CurrentUser() u: any) { return this.service.listOrgs(u.tenantId); }

  @Get('hierarchy')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Inventory organization hierarchy tree' })
  hierarchy(@CurrentUser() u: any) { return this.service.orgHierarchy(u.tenantId); }

  @Post()
  @RequirePermission('inventory:manage')
  createOrg(@CurrentUser() u: any, @Body() b: any) { return this.service.createOrg(u.tenantId, b); }

  @Patch(':id')
  @RequirePermission('inventory:manage')
  updateOrg(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.updateOrg(u.tenantId, id, b); }

  // ─── Ph-136: item-org assignments ─────────────────────────────────
  @Get('assignments')
  @RequirePermission('inventory:read')
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'organizationId', required: false })
  listAssignments(@CurrentUser() u: any, @Query('itemId') itemId?: string, @Query('organizationId') organizationId?: string) {
    return this.service.listAssignments(u.tenantId, { itemId, organizationId });
  }

  @Post('assignments')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Assign an item to an organization' })
  assignItem(@CurrentUser() u: any, @Body() b: any) { return this.service.assignItem(u.tenantId, b); }

  @Patch('assignments/:id')
  @RequirePermission('inventory:manage')
  updateAssignment(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.updateAssignment(u.tenantId, id, b); }

  // ─── Ph-135: inter-org transfers ──────────────────────────────────
  @Get('transfers')
  @RequirePermission('inventory:read')
  @ApiQuery({ name: 'status', required: false })
  listTransfers(@CurrentUser() u: any, @Query('status') status?: InterOrgStatus) {
    return this.service.listTransfers(u.tenantId, status);
  }

  @Post('transfers')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Create an inter-org transfer (computes transfer price + total)' })
  createTransfer(@CurrentUser() u: any, @Body() b: any) { return this.service.createTransfer(u.tenantId, b); }

  @Post('transfers/:id/ship')
  @RequirePermission('inventory:manage')
  ship(@CurrentUser() u: any, @Param('id') id: string) { return this.service.shipTransfer(u.tenantId, id); }

  @Post('transfers/:id/receive')
  @RequirePermission('inventory:manage')
  receive(@CurrentUser() u: any, @Param('id') id: string) { return this.service.receiveTransfer(u.tenantId, id); }

  @Post('transfers/:id/cancel')
  @RequirePermission('inventory:manage')
  cancel(@CurrentUser() u: any, @Param('id') id: string) { return this.service.cancelTransfer(u.tenantId, id); }
}
