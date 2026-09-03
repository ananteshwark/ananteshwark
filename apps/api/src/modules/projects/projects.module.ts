import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { Task } from './entities/task.entity';
import { ProjectExpense } from './entities/project-expense.entity';
import { ProjectTimeEntry } from './entities/project-time-entry.entity';
import { Milestone } from './entities/milestone.entity';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, ProjectMember, Task, ProjectExpense, ProjectTimeEntry, Milestone]),
    RbacModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
