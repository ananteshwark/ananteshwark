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

@Module({
  imports: [EmployeeModule, AttendanceModule, LeaveModule, ExitModule, FamilyModule, PolicyModule, JourneysModule, DisciplinaryModule, AlumniModule],
  exports: [EmployeeModule, AttendanceModule, LeaveModule, ExitModule, FamilyModule, PolicyModule, JourneysModule, DisciplinaryModule, AlumniModule],
})
export class HrModule {}
