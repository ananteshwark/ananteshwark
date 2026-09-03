import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('email')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('email')
export class EmailController {
  constructor(private readonly service: EmailService) {}

  @Get('smtp-config')
  @RequirePermission('hr:org:manage')
  getSmtpConfig(@CurrentUser() user: any) {
    return this.service.getSmtpConfig(user.tenantId);
  }

  @Post('smtp-config')
  @RequirePermission('hr:org:manage')
  saveSmtpConfig(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.saveSmtpConfig(user.tenantId, dto);
  }

  @Post('smtp-config/test')
  @RequirePermission('hr:org:manage')
  testSmtp(@CurrentUser() user: any, @Body() body: { to?: string }) {
    return this.service.testSmtp(user.tenantId, body?.to);
  }

  @Get('templates')
  @RequirePermission('hr:org:manage')
  listTemplates(@CurrentUser() user: any) {
    return this.service.listTemplates(user.tenantId);
  }

  @Post('templates')
  @RequirePermission('hr:org:manage')
  saveTemplate(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.saveTemplate(user.tenantId, dto);
  }

  @Patch('templates/:id')
  @RequirePermission('hr:org:manage')
  updateTemplate(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.saveTemplate(user.tenantId, { ...dto, id });
  }

  @Get('logs')
  @RequirePermission('hr:org:manage')
  getLogs(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.service.getLogs(user.tenantId, limit ? parseInt(limit, 10) : 100);
  }
}
