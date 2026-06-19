import { Module } from '@nestjs/common';
import { EmployeeModule } from './employees/employee.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveModule } from './leave/leave.module';

@Module({
  imports: [EmployeeModule, AttendanceModule, LeaveModule],
  exports: [EmployeeModule, AttendanceModule, LeaveModule],
})
export class HrModule {}
