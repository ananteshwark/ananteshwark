import { Module } from '@nestjs/common';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { EmployeeTransfer } from '../../hr/employees/entities/employee-transfer.entity';
import { LeaveApplication } from '../../hr/leave/entities/leave-application.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PredictiveScore } from './entities/predictive-score.entity';
import { PredictiveService } from './predictive.service';
import { PredictiveController } from './predictive.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PredictiveScore, Employee, EmployeeTransfer, LeaveApplication]),
    RbacModule,
  ],
  controllers: [PredictiveController],
  providers: [PredictiveService],
  exports: [PredictiveService],
})
export class PredictiveModule {}
