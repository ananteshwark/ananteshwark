import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectResource } from './entities/project-resource.entity';
import { ResourceRequest } from './entities/resource-request.entity';
import { ResourceAllocation } from './entities/resource-allocation.entity';
import { ResourcesService } from './resources.service';
import { ResourcesController } from './resources.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectResource, ResourceRequest, ResourceAllocation]),
    RbacModule,
  ],
  controllers: [ResourcesController],
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ProjectResourcesModule {}
