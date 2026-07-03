import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantLicense } from '../admin/entities/tenant-license.entity';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { TenantContextService } from './tenant-context.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantLicense])],
  controllers: [TenantsController],
  providers: [TenantsService, TenantContextService],
  exports: [TenantsService, TenantContextService],
})
export class TenantsModule {}
