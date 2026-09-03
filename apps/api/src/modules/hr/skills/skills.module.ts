import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillCategory } from './entities/skill-category.entity';
import { Skill } from './entities/skill.entity';
import { EmployeeSkill } from './entities/employee-skill.entity';
import { JobSkillRequirement } from './entities/job-skill-requirement.entity';
import { SkillRelation } from './entities/skill-relation.entity';
import { ProficiencyDescriptor } from './entities/proficiency-descriptor.entity';
import { SkillAttestation } from './entities/skill-attestation.entity';
import { Course } from '../../talent/learning/entities/course.entity';
import { SkillsService } from './skills.service';
import { SkillsController } from './skills.controller';
import { SkillOntologyService } from './skill-ontology.service';
import { SkillOntologyController } from './skill-ontology.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SkillCategory, Skill, EmployeeSkill, JobSkillRequirement, Course,
      SkillRelation, ProficiencyDescriptor, SkillAttestation,
    ]),
    RbacModule,
  ],
  controllers: [SkillsController, SkillOntologyController],
  providers: [SkillsService, SkillOntologyService],
  exports: [SkillsService, SkillOntologyService],
})
export class SkillsModule {}
