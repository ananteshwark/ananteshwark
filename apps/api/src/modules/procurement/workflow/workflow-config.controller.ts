import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WorkflowConfigService } from './workflow-config.service';
import { UpdateWorkflowConfigDto } from './dto/workflow-config.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('procurement-workflow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/workflow-config')
export class WorkflowConfigController {
  constructor(private readonly service: WorkflowConfigService) {}

  @Get()
  @RequirePermission('procurement:po:read')
  @ApiOperation({ summary: 'Get workflow configuration' })
  getConfig(@CurrentUser() user: any) {
    return this.service.getConfig(user.tenantId);
  }

  @Patch()
  @RequirePermission('procurement:po:approve')
  @ApiOperation({ summary: 'Update workflow configuration' })
  updateConfig(@CurrentUser() user: any, @Body() dto: UpdateWorkflowConfigDto) {
    return this.service.updateConfig(user.tenantId, dto);
  }
}
