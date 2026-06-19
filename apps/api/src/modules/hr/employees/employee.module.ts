import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { Department } from './entities/department.entity';
import { Designation } from './entities/designation.entity';
import { Location } from './entities/location.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { EmployeeService } from './employee.service';
import { EmployeeController } from './employee.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, Department, Designation, Location, EmployeeDocument]),
    RbacModule,
  ],
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService, TypeOrmModule],
})
export class EmployeeModule {}
