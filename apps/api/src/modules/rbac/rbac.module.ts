import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { UserRole } from './entities/user-role.entity';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import { PermissionsService } from './permissions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Role, UserRole])],
  controllers: [RbacController],
  providers: [RbacService, PermissionsService],
  exports: [RbacService, PermissionsService],
})
export class RbacModule {}
