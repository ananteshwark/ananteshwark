import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RosterDemand, RosterEntry } from './roster.entity';
import { Shift } from '../attendance/entities/shift.entity';
import { Employee } from '../employees/entities/employee.entity';
import { LeaveApplication } from '../leave/entities/leave-application.entity';
import { RosterService } from './roster.service';
import { RosterController } from './roster.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RosterDemand, RosterEntry, Shift, Employee, LeaveApplication]),
    RbacModule,
  ],
  controllers: [RosterController],
  providers: [RosterService],
  exports: [RosterService],
})
export class RosterModule {}
