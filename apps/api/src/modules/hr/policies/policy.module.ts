import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HrPolicy, HrPolicyAcknowledgement } from './policy.entity';
import { PolicyService } from './policy.service';
import { PolicyController } from './policy.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([HrPolicy, HrPolicyAcknowledgement]), RbacModule],
  controllers: [PolicyController],
  providers: [PolicyService],
  exports: [PolicyService],
})
export class PolicyModule {}
