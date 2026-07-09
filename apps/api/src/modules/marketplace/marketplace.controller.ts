import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MarketplaceService } from './marketplace.service';

@ApiTags('marketplace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('platform/marketplace')
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}

  @Get('listings')
  @RequirePermission('admin:read')
  @ApiOperation({ summary: 'Browse the extension catalog (public + own private listings)' })
  browse(@CurrentUser() user: any) {
    return this.service.browse(user.tenantId);
  }

  @Post('listings')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Publish an extension listing (or a new version of your own)' })
  publish(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.publish(user.tenantId, dto);
  }

  @Get('installed')
  @RequirePermission('admin:read')
  @ApiOperation({ summary: 'Extensions installed for this tenant' })
  installed(@CurrentUser() user: any) {
    return this.service.installed(user.tenantId);
  }

  @Get('menu')
  @RequirePermission('admin:read')
  @ApiOperation({ summary: 'Navigation entries contributed by installed extensions' })
  menu(@CurrentUser() user: any) {
    return this.service.menu(user.tenantId);
  }

  @Post('installs/:slug')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Install (or upgrade) an extension by slug' })
  install(@CurrentUser() user: any, @Param('slug') slug: string, @Body() body: { config?: Record<string, any> }) {
    return this.service.install(user.tenantId, user.id, slug, body?.config ?? {});
  }

  @Delete('installs/:slug')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Uninstall an extension, removing exactly what it created' })
  uninstall(@CurrentUser() user: any, @Param('slug') slug: string) {
    return this.service.uninstall(user.tenantId, slug);
  }
}
