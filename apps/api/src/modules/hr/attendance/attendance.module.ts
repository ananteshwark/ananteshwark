import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shift } from './entities/shift.entity';
import { ShiftAssignment } from './entities/shift-assignment.entity';
import { Holiday } from './entities/holiday.entity';
import { AttendanceRecord } from './entities/attendance-record.entity';
import { TimeEntry } from './entities/time-entry.entity';
import { Timesheet } from './entities/timesheet.entity';
import { TimeEvaluationRule } from './entities/time-evaluation-rule.entity';
import { TimeEvaluationResult } from './entities/time-evaluation-result.entity';
import { ShiftPattern } from './entities/shift-pattern.entity';
import { Geofence } from './entities/geofence.entity';
import { Employee } from '../employees/entities/employee.entity';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { TimeEvaluationService } from './time-evaluation.service';
import { TimeEvaluationController } from './time-evaluation.controller';
import { TimePolicyService } from './time-policy.service';
import { TimePolicyController } from './time-policy.controller';
import { BreakRule, AttendanceInfraction, FairWorkweekRule } from './entities/workweek.entity';
import { WorkweekService } from './workweek.service';
import { WorkweekController } from './workweek.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shift, ShiftAssignment, Holiday, AttendanceRecord, TimeEntry, Timesheet, TimeEvaluationRule, TimeEvaluationResult, ShiftPattern, Geofence, Employee, BreakRule, AttendanceInfraction, FairWorkweekRule]),
    RbacModule,
  ],
  controllers: [AttendanceController, TimeEvaluationController, TimePolicyController, WorkweekController],
  providers: [AttendanceService, TimeEvaluationService, TimePolicyService, WorkweekService],
  exports: [AttendanceService, TimeEvaluationService, TimePolicyService, WorkweekService, TypeOrmModule],
})
export class AttendanceModule {}
