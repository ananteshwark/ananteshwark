import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { TenantExportService } from './tenant-export.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { TenantLicense } from './entities/tenant-license.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import { UsersModule } from '../users/users.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, User, TenantLicense, UserRole]), UsersModule, RbacModule],
  controllers: [AdminController],
  providers: [AdminService, TenantExportService],
  exports: [AdminService],
})
export class AdminModule {}
