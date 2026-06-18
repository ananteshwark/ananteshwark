import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantsService } from '../../modules/tenants/tenants.service';
import { TenantContextService } from '../../modules/tenants/tenant-context.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'] as string;
    const host = req.headers.host || '';
    const subdomain = host.split('.')[0];

    let tenant = null;

    if (tenantId) {
      try {
        // try as UUID first
        if (tenantId.match(/^[0-9a-f-]{36}$/i)) {
          tenant = await this.tenantsService.findById(tenantId);
        } else {
          tenant = await this.tenantsService.findBySlug(tenantId);
        }
      } catch (e) {
        // not found, continue
      }
    }

    if (!tenant && subdomain && subdomain !== 'localhost' && subdomain !== 'www' && !subdomain.includes(':')) {
      try {
        tenant = await this.tenantsService.findBySlug(subdomain);
      } catch (e) {
        // no tenant from subdomain
      }
    }

    if (tenant) {
      this.tenantContextService.setTenant(tenant);
      (req as any).tenant = tenant;
    }

    next();
  }
}
