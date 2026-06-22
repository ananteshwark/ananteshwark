import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DelegationService } from './delegation.service';
import { CreateDelegationDto, UpdateDelegationDto } from './dto/delegation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('delegations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('delegations')
export class DelegationController {
  constructor(private readonly delegationService: DelegationService) {}

  @Get()
  @RequirePermission('hr:org:manage')
  @ApiOperation({ summary: 'List approval delegations' })
  @ApiQuery({ name: 'delegatorUserId', required: false })
  @ApiQuery({ name: 'delegateeUserId', required: false })
  @ApiQuery({ name: 'active', required: false })
  list(
    @CurrentUser() user: any,
    @Query('delegatorUserId') delegatorUserId?: string,
    @Query('delegateeUserId') delegateeUserId?: string,
    @Query('active') active?: string,
  ) {
    return this.delegationService.list(user.tenantId, {
      delegatorUserId,
      delegateeUserId,
      active: active === undefined ? undefined : active === 'true',
    });
  }

  @Get('active')
  @ApiOperation({ summary: "Get the current user's active inbound/outbound delegations" })
  getActive(@CurrentUser() user: any) {
    return this.delegationService.getActiveForUser(user.tenantId, user.id);
  }

  @Post()
  @RequirePermission('hr:org:manage')
  @ApiOperation({ summary: 'Create an approval delegation' })
  create(@CurrentUser() user: any, @Body() dto: CreateDelegationDto) {
    return this.delegationService.create(user.tenantId, user.id, dto);
  }

  @Patch(':id')
  @RequirePermission('hr:org:manage')
  @ApiOperation({ summary: 'Update an approval delegation' })
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateDelegationDto,
  ) {
    return this.delegationService.update(id, user.tenantId, dto);
  }

  @Post(':id/revoke')
  @RequirePermission('hr:org:manage')
  @ApiOperation({ summary: 'Revoke (deactivate) an approval delegation' })
  revoke(@CurrentUser() user: any, @Param('id') id: string) {
    return this.delegationService.revoke(id, user.tenantId);
  }
}
