import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveType } from './entities/leave-type.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveApplication } from './entities/leave-application.entity';
import { LeaveAccrualLog } from './entities/leave-accrual-log.entity';
import { LeaveBlackout } from './entities/leave-blackout.entity';
import { LeaveEncashment } from './entities/leave-encashment.entity';
import { Employee } from '../employees/entities/employee.entity';
import { LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';
import { RbacModule } from '../../rbac/rbac.module';
import { EmailModule } from '../../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaveType, LeaveBalance, LeaveApplication, LeaveAccrualLog, LeaveBlackout, LeaveEncashment, Employee]),
    RbacModule,
    EmailModule,
  ],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService, TypeOrmModule],
})
export class LeaveModule {}
