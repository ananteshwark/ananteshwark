import { Module } from '@nestjs/common';
import { EmployeeModule } from './employees/employee.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveModule } from './leave/leave.module';
import { ExitModule } from './exits/exit.module';
import { FamilyModule } from './family/family.module';

@Module({
  imports: [EmployeeModule, AttendanceModule, LeaveModule, ExitModule, FamilyModule],
  exports: [EmployeeModule, AttendanceModule, LeaveModule, ExitModule, FamilyModule],
})
export class HrModule {}
