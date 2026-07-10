import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { FormsService } from './forms.service';
import { FormStatus } from './entities/form.entity';

@ApiTags('platform-forms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('platform/forms')
export class FormsController {
  constructor(private readonly service: FormsService) {}

  @Get()
  @RequirePermission('platform:forms:read')
  list(@CurrentUser() user: any, @Query('status') status?: FormStatus) {
    return this.service.listForms(user.tenantId, status);
  }

  @Post()
  @RequirePermission('platform:forms:manage')
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createForm(user.tenantId, dto);
  }

  @Get(':id')
  @RequirePermission('platform:forms:read')
  get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getForm(user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermission('platform:forms:manage')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateForm(user.tenantId, id, dto);
  }

  @Post(':id/publish')
  @RequirePermission('platform:forms:manage')
  publish(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.publish(user.tenantId, id);
  }

  @Post(':id/archive')
  @RequirePermission('platform:forms:manage')
  archive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.archive(user.tenantId, id);
  }

  @Get(':id/submissions')
  @RequirePermission('platform:forms:read')
  listSubmissions(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.listSubmissions(user.tenantId, id);
  }

  @Post(':id/submit')
  @RequirePermission('platform:forms:submit')
  @ApiOperation({ summary: 'Submit values against a published form (server-validated)' })
  submit(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { values: Record<string, any>; subjectRef?: string }) {
    return this.service.submit(user.tenantId, id, { values: body?.values ?? {}, subjectRef: body?.subjectRef, submittedByUserId: user.id });
  }
}
