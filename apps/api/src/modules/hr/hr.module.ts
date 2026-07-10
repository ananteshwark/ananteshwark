import { Module } from '@nestjs/common';
import { EmployeeModule } from './employees/employee.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveModule } from './leave/leave.module';
import { ExitModule } from './exits/exit.module';
import { FamilyModule } from './family/family.module';
import { PolicyModule } from './policies/policy.module';
import { JourneysModule } from './journeys/journeys.module';
import { DisciplinaryModule } from './disciplinary/disciplinary.module';
import { AlumniModule } from './alumni/alumni.module';
import { I9Module } from './i9/i9.module';

@Module({
  imports: [EmployeeModule, AttendanceModule, LeaveModule, ExitModule, FamilyModule, PolicyModule, JourneysModule, DisciplinaryModule, AlumniModule, I9Module],
  exports: [EmployeeModule, AttendanceModule, LeaveModule, ExitModule, FamilyModule, PolicyModule, JourneysModule, DisciplinaryModule, AlumniModule, I9Module],
})
export class HrModule {}
