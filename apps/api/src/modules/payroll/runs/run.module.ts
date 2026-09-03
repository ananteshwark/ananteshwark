import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollRun } from './entities/payroll-run.entity';
import { Payslip } from './entities/payslip.entity';
import { BankFileRun } from './entities/bank-file-run.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { Account } from '../../finance/gl/entities/account.entity';
import { PayrollGlMapping } from '../entities/payroll-gl-mapping.entity';
import { RunService } from './run.service';
import { BankFileService } from './bank-file.service';
import { RunController } from './run.controller';
import { PayrollGlService } from '../payroll-gl.service';
import { PayrollGlController } from '../payroll-gl.controller';
import { ComponentModule } from '../components/component.module';
import { StatutoryModule } from '../statutory/statutory.module';
import { RetroPayrollModule } from '../retro/retro-payroll.module';
import { GlModule } from '../../finance/gl/gl.module';
import { RbacModule } from '../../rbac/rbac.module';
import { LocalizationModule } from '../../localization/localization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PayrollRun,
      Payslip,
      BankFileRun,
      Employee,
      Account,
      PayrollGlMapping,
    ]),
    ComponentModule,
    StatutoryModule,
    RetroPayrollModule,
    GlModule,
    RbacModule,
    LocalizationModule,
  ],
  controllers: [RunController, PayrollGlController],
  providers: [RunService, BankFileService, PayrollGlService],
  exports: [RunService, BankFileService, PayrollGlService],
})
export class RunModule {}
