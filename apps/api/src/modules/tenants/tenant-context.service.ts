import { Injectable, Scope } from '@nestjs/common';
import { Tenant } from './entities/tenant.entity';

@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  private tenant: Tenant | null = null;

  setTenant(tenant: Tenant) {
    this.tenant = tenant;
  }

  getTenant(): Tenant | null {
    return this.tenant;
  }

  getTenantId(): string | null {
    return this.tenant?.id || null;
  }
}
