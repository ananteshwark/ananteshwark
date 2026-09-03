import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArrearsRecord } from './entities/arrears-record.entity';
import { EmployeeSalary } from '../components/entities/employee-salary.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { PayrollRun } from '../runs/entities/payroll-run.entity';
import { Payslip } from '../runs/entities/payslip.entity';
import { RetroPayrollService } from './retro-payroll.service';
import { RetroPayrollController } from './retro-payroll.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ArrearsRecord,
      EmployeeSalary,
      Employee,
      PayrollRun,
      Payslip,
    ]),
    RbacModule,
  ],
  controllers: [RetroPayrollController],
  providers: [RetroPayrollService],
  exports: [RetroPayrollService],
})
export class RetroPayrollModule {}
