import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../../talent/learning/entities/course.entity';
import { Skill } from '../../hr/skills/entities/skill.entity';
import { EmployeeSkill } from '../../hr/skills/entities/employee-skill.entity';
import { JobSkillRequirement } from '../../hr/skills/entities/job-skill-requirement.entity';
import { AiLearningService } from './ai-learning.service';
import { AiLearningController } from './ai-learning.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([Course, Skill, EmployeeSkill, JobSkillRequirement]), RbacModule],
  controllers: [AiLearningController],
  providers: [AiLearningService],
  exports: [AiLearningService],
})
export class AiLearningModule {}
