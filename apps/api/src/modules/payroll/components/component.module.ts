import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayComponent } from './entities/pay-component.entity';
import { SalaryStructure } from './entities/salary-structure.entity';
import { SalaryStructureComponent } from './entities/salary-structure-component.entity';
import { EmployeeSalary } from './entities/employee-salary.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { ComponentService } from './component.service';
import { ComponentController } from './component.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PayComponent,
      SalaryStructure,
      SalaryStructureComponent,
      EmployeeSalary,
      Employee,
    ]),
    RbacModule,
  ],
  controllers: [ComponentController],
  providers: [ComponentService],
  exports: [ComponentService, TypeOrmModule],
})
export class ComponentModule {}
