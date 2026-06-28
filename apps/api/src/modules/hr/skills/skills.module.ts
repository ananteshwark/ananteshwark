import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillCategory } from './entities/skill-category.entity';
import { Skill } from './entities/skill.entity';
import { EmployeeSkill } from './entities/employee-skill.entity';
import { JobSkillRequirement } from './entities/job-skill-requirement.entity';
import { Course } from '../../talent/learning/entities/course.entity';
import { SkillsService } from './skills.service';
import { SkillsController } from './skills.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SkillCategory, Skill, EmployeeSkill, JobSkillRequirement, Course]),
    RbacModule,
  ],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
