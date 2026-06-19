import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shift } from './entities/shift.entity';
import { ShiftAssignment } from './entities/shift-assignment.entity';
import { Holiday } from './entities/holiday.entity';
import { AttendanceRecord } from './entities/attendance-record.entity';
import { TimeEntry } from './entities/time-entry.entity';
import { Timesheet } from './entities/timesheet.entity';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shift, ShiftAssignment, Holiday, AttendanceRecord, TimeEntry, Timesheet]),
    RbacModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService, TypeOrmModule],
})
export class AttendanceModule {}
