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
import { Position } from './entities/position.entity';
import { Grade } from './entities/grade.entity';
import { EmployeeService } from './employee.service';
import { EmployeeController } from './employee.controller';
import { PositionService } from './position.service';
import { PositionController } from './position.controller';
import { RbacModule } from '../../rbac/rbac.module';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, Department, BusinessUnit, LegalEntity, Division, OrgFunction, SubFunction, Team, Designation, Location, EmployeeDocument, EmployeeTransfer, OrgLevelConfig, Position, Grade]),
    RbacModule,
    UsersModule,
  ],
  controllers: [EmployeeController, PositionController],
  providers: [EmployeeService, PositionService],
  exports: [EmployeeService, PositionService, TypeOrmModule],
})
export class EmployeeModule {}
