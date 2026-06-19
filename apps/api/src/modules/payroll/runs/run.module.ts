import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollRun } from './entities/payroll-run.entity';
import { Payslip } from './entities/payslip.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { Account } from '../../finance/gl/entities/account.entity';
import { RunService } from './run.service';
import { RunController } from './run.controller';
import { ComponentModule } from '../components/component.module';
import { StatutoryModule } from '../statutory/statutory.module';
import { GlModule } from '../../finance/gl/gl.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PayrollRun, Payslip, Employee, Account]),
    ComponentModule,
    StatutoryModule,
    GlModule,
    RbacModule,
  ],
  controllers: [RunController],
  providers: [RunService],
  exports: [RunService],
})
export class RunModule {}
