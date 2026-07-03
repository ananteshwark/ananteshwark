import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantLicense } from '../admin/entities/tenant-license.entity';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { TenantModulesController } from './tenant-modules.controller';
import { TenantContextService } from './tenant-context.service';
import { RbacModule } from '../rbac/rbac.module';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantLicense]), RbacModule],
  controllers: [TenantsController, TenantModulesController],
  providers: [TenantsService, TenantContextService],
  exports: [TenantsService, TenantContextService],
})
export class TenantsModule {}
