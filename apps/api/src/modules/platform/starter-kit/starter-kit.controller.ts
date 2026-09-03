import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { StarterKitService } from './starter-kit.service';

@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('platform/starter-kit')
export class StarterKitController {
  constructor(private readonly service: StarterKitService) {}

  @Post('seed')
  @ApiOperation({ summary: 'Seed default content (leave types, badges, letters, KB, journeys) — idempotent' })
  @RequirePermission('settings:manage')
  seed(@CurrentUser() user: any) {
    return this.service.seed(user.tenantId);
  }
}
