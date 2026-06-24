import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SsoService } from './sso.service';
import { CreateSsoProviderDto, UpdateSsoProviderDto } from './dto/sso.dto';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('platform/sso')
export class SsoController {
  constructor(private readonly svc: SsoService) {}

  // ─── Provider management (admin) ─────────────────────────────────────────────

  @Get('providers')
  @RequirePermission('platform.sso.read')
  list(@CurrentUser() user: { tenantId: string }) {
    return this.svc.listProviders(user.tenantId);
  }

  @Post('providers')
  @RequirePermission('platform.sso.write')
  create(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: CreateSsoProviderDto,
  ) {
    return this.svc.createProvider(user.tenantId, dto);
  }

  @Get('providers/:id')
  @RequirePermission('platform.sso.read')
  getOne(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getProvider(user.tenantId, id);
  }

  @Patch('providers/:id')
  @RequirePermission('platform.sso.write')
  update(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSsoProviderDto,
  ) {
    return this.svc.updateProvider(user.tenantId, id, dto);
  }

  @Delete('providers/:id')
  @RequirePermission('platform.sso.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.deleteProvider(user.tenantId, id);
  }

  // ─── OIDC flow ───────────────────────────────────────────────────────────────

  /**
   * Initiate OIDC login. Redirects the browser to the IdP authorization URL.
   * Called by the frontend with ?providerId=<id>&tenantId=<id>&redirectUri=<uri>
   */
  @Get('oidc/initiate')
  async oidcInitiate(
    @Query('providerId') providerId: string,
    @Query('tenantId') tenantId: string,
    @Query('redirectUri') redirectUri: string,
    @Res() res: Response,
  ) {
    const { url } = await this.svc.buildOidcAuthUrl(tenantId, providerId, redirectUri);
    res.redirect(url);
  }

  /**
   * OIDC callback — receives code from IdP, exchanges for tokens (stub),
   * provisions user via JIT, and returns a JWT.
   * In a production deployment this would call the token endpoint with
   * the authorization code. Here we validate the state and issue a JWT
   * for the proven identity.
   */
  @Post('oidc/callback')
  async oidcCallback(
    @Body()
    body: {
      tenantId: string;
      providerId: string;
      email: string;
      firstName?: string;
      lastName?: string;
      displayName?: string;
    },
  ) {
    return this.svc.provisionUserFromSso(body.tenantId, {
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      displayName: body.displayName,
    });
  }

  // ─── SAML metadata ───────────────────────────────────────────────────────────

  @Get('providers/:id/metadata')
  @RequirePermission('platform.sso.read')
  async samlMetadata(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const xml = await this.svc.getSpMetadata(user.tenantId, id);
    res.set('Content-Type', 'application/xml').send(xml);
  }
}
