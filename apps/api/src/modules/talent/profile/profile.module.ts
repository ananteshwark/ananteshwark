import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { EmployeeSkill } from '../../hr/skills/entities/employee-skill.entity';
import { Objective } from '../goals/entities/objective.entity';
import { Recognition } from '../../engagement/entities/recognition.entity';
import { IdpPlan } from '../idp/idp.entity';
import { ContinuousFeedback } from '../feedback/feedback.entity';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, EmployeeSkill, Objective, Recognition, IdpPlan, ContinuousFeedback]),
    RbacModule,
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
