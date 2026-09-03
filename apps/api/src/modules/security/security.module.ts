import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MfaEnrollment } from './entities/mfa-enrollment.entity';
import { IpAllowlistEntry } from './entities/ip-allowlist.entity';
import { UserSession } from './entities/user-session.entity';
import { SecurityService } from './security.service';
import { SecurityController } from './security.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MfaEnrollment, IpAllowlistEntry, UserSession]),
    RbacModule,
  ],
  controllers: [SecurityController],
  providers: [SecurityService],
  exports: [SecurityService],
})
export class SecurityModule {}
