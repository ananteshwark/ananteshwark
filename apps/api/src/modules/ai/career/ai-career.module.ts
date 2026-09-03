import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeSkill } from '../../hr/skills/entities/employee-skill.entity';
import { JobSkillRequirement } from '../../hr/skills/entities/job-skill-requirement.entity';
import { Skill } from '../../hr/skills/entities/skill.entity';
import { AiCareerService } from './ai-career.service';
import { AiCareerController } from './ai-career.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeSkill, JobSkillRequirement, Skill]), RbacModule],
  controllers: [AiCareerController],
  providers: [AiCareerService],
  exports: [AiCareerService],
})
export class AiCareerModule {}
