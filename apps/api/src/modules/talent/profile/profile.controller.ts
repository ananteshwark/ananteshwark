import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ProfileService } from './profile.service';

@ApiTags('talent-profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('talent/profile')
export class ProfileController {
  constructor(private readonly service: ProfileService) {}

  @Get(':employeeId')
  @RequirePermission('hr:employees:read')
  @ApiOperation({ summary: 'Aggregated talent profile snapshot for an employee' })
  getProfile(@CurrentUser() user: any, @Param('employeeId') employeeId: string) {
    return this.service.getProfile(user.tenantId, employeeId);
  }
}
