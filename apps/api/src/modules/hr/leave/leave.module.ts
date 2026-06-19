import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveType } from './entities/leave-type.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveApplication } from './entities/leave-application.entity';
import { LeaveAccrualLog } from './entities/leave-accrual-log.entity';
import { LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaveType, LeaveBalance, LeaveApplication, LeaveAccrualLog]),
    RbacModule,
  ],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService, TypeOrmModule],
})
export class LeaveModule {}
