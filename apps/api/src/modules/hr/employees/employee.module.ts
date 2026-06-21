import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { Department } from './entities/department.entity';
import { BusinessUnit } from './entities/business-unit.entity';
import { LegalEntity } from './entities/legal-entity.entity';
import { Division } from './entities/division.entity';
import { OrgFunction } from './entities/org-function.entity';
import { SubFunction } from './entities/sub-function.entity';
import { Team } from './entities/team.entity';
import { Designation } from './entities/designation.entity';
import { Location } from './entities/location.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { EmployeeTransfer } from './entities/employee-transfer.entity';
import { OrgLevelConfig } from './entities/org-level-config.entity';
import { EmployeeService } from './employee.service';
import { EmployeeController } from './employee.controller';
import { RbacModule } from '../../rbac/rbac.module';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, Department, BusinessUnit, LegalEntity, Division, OrgFunction, SubFunction, Team, Designation, Location, EmployeeDocument, EmployeeTransfer, OrgLevelConfig]),
    RbacModule,
    UsersModule,
  ],
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService, TypeOrmModule],
})
export class EmployeeModule {}
