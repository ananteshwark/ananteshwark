import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AssistantService } from './assistant.service';
import { CopilotService } from './copilot.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly service: AssistantService,
    private readonly copilot: CopilotService,
  ) {}

  @Post('copilot')
  @RequirePermission('dashboard:read')
  @ApiOperation({ summary: 'Execute a natural-language command (task-completing copilot)' })
  runCopilot(@CurrentUser() user: any, @Body() b: { message: string }) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    return this.copilot.execute(user.tenantId, { id: user.id, name }, b?.message ?? '');
  }

  @Get('copilot/capabilities')
  @RequirePermission('dashboard:read')
  capabilities() {
    return this.copilot.capabilities();
  }

  @Post('classify')
  @RequirePermission('dashboard:read')
  @ApiOperation({ summary: 'Classify an utterance into an ERP intent' })
  classify(@CurrentUser() _u: any, @Body() b: { utterance: string }) { return this.service.classify(b.utterance); }

  @Post('chat')
  @RequirePermission('dashboard:read')
  @ApiOperation({ summary: 'Classify + respond using provided live context' })
  chat(@CurrentUser() u: any, @Body() b: { utterance: string; context?: any }) { return this.service.handle(u.tenantId, u.id, b.utterance, b.context ?? {}); }

  @Get('history')
  @RequirePermission('dashboard:read')
  history(@CurrentUser() u: any) { return this.service.history(u.tenantId, u.id); }
}
