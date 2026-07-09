import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { OnaService } from './ona.service';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('analytics/ona')
export class OnaController {
  constructor(private readonly service: OnaService) {}

  @Get()
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Org network analysis: connectors, bridges, silos, isolation, manager span' })
  analyze(@CurrentUser() user: any) {
    return this.service.analyze(user.tenantId);
  }
}
