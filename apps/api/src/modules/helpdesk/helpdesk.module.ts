import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HrCase, HrCaseComment } from './entities/hr-case.entity';
import { HrCaseRoutingRule } from './entities/hr-case-routing-rule.entity';
import { HelpdeskService } from './helpdesk.service';
import { HelpdeskController } from './helpdesk.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([HrCase, HrCaseComment, HrCaseRoutingRule]), RbacModule],
  controllers: [HelpdeskController],
  providers: [HelpdeskService],
  exports: [HelpdeskService],
})
export class HelpdeskModule {}
