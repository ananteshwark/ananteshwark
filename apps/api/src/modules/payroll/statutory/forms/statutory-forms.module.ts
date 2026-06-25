import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatutoryForm } from './entities/statutory-form.entity';
import { EosbSettlement } from './entities/eosb-settlement.entity';
import { Payslip } from '../../runs/entities/payslip.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { StatutoryFormsService } from './statutory-forms.service';
import { StatutoryFormsController } from './statutory-forms.controller';
import { EmailModule } from '../../../email/email.module';
import { RbacModule } from '../../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StatutoryForm, EosbSettlement, Payslip, Employee]),
    EmailModule,
    RbacModule,
  ],
  controllers: [StatutoryFormsController],
  providers: [StatutoryFormsService],
  exports: [StatutoryFormsService],
})
export class StatutoryFormsModule {}
