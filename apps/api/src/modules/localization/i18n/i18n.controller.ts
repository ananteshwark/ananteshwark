import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { I18nService } from './i18n.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('i18n')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('localization/i18n')
export class I18nController {
  constructor(private readonly service: I18nService) {}

  @Get('locales')
  @RequirePermission('settings:read')
  listLocales(@CurrentUser() u: any) { return this.service.listLocales(u.tenantId); }

  @Post('locales/seed')
  @RequirePermission('settings:manage')
  @ApiOperation({ summary: 'Seed default locales (incl. RTL ar/he)' })
  seed(@CurrentUser() u: any) { return this.service.seedLocales(u.tenantId); }

  @Post('translations')
  @RequirePermission('settings:manage')
  upsert(@CurrentUser() u: any, @Body() b: any) { return this.service.upsertTranslation(u.tenantId, b); }

  @Get('bundle')
  @RequirePermission('settings:read')
  @ApiQuery({ name: 'locale', required: true })
  @ApiQuery({ name: 'namespace', required: false })
  bundle(@CurrentUser() u: any, @Query('locale') locale: string, @Query('namespace') namespace?: string) {
    return this.service.bundle(u.tenantId, locale, namespace ?? 'ui');
  }

  @Post('translate')
  @RequirePermission('settings:read')
  @ApiOperation({ summary: 'Render a template string in a locale with interpolation' })
  translate(@CurrentUser() u: any, @Body() b: { locale: string; namespace?: string; key: string; vars?: any }) {
    return this.service.translate(u.tenantId, b.locale, b.namespace ?? 'ui', b.key, b.vars ?? {});
  }

  @Post('format')
  @RequirePermission('settings:read')
  @ApiOperation({ summary: 'Locale-aware number/currency/date formatting' })
  format(@CurrentUser() _u: any, @Body() b: { locale: string; kind: 'number' | 'currency' | 'date'; value: any; currency?: string }) {
    return this.service.format(b.locale, b.kind, b.value, { currency: b.currency });
  }
}
