import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdpPlan, IdpItem } from './idp.entity';
import { IdpService } from './idp.service';
import { IdpController } from './idp.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([IdpPlan, IdpItem]), RbacModule],
  controllers: [IdpController],
  providers: [IdpService],
  exports: [IdpService],
})
export class IdpModule {}
