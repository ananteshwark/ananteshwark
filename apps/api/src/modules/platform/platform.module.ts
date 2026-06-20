import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SsoProvider } from './entities/sso-provider.entity';
import { SodRule } from './entities/sod-rule.entity';
import { SodViolation } from './entities/sod-violation.entity';
import { TaxCode } from './entities/tax-code.entity';
import { DataRetentionPolicy } from './entities/data-retention-policy.entity';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SsoProvider, SodRule, SodViolation, TaxCode, DataRetentionPolicy]),
    RbacModule,
  ],
  controllers: [PlatformController],
  providers: [PlatformService],
  exports: [PlatformService],
})
export class PlatformModule {}
