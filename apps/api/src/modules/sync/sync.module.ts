import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncMutation } from './entities/sync-mutation.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { ExpenseClaim } from '../expenses/entities/expense-claim.entity';
import { LeaveApplication } from '../hr/leave/entities/leave-application.entity';
import { TravelRequest } from '../travel/entities/travel-request.entity';
import { HrCase } from '../helpdesk/entities/hr-case.entity';
import { MobileCheckin } from '../mobile/entities/mobile-checkin.entity';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { MobileModule } from '../mobile/mobile.module';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SyncMutation, Employee, ExpenseClaim, LeaveApplication, TravelRequest, HrCase, MobileCheckin,
    ]),
    MobileModule,
    HelpdeskModule,
    RbacModule,
  ],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
