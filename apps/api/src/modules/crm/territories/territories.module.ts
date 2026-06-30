import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Territory } from './entities/territory.entity';
import { Quota } from './entities/quota.entity';
import { CrmOpportunity } from '../entities/crm-opportunity.entity';
import { TerritoriesService } from './territories.service';
import { TerritoriesController } from './territories.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Territory, Quota, CrmOpportunity]),
    RbacModule,
  ],
  controllers: [TerritoriesController],
  providers: [TerritoriesService],
  exports: [TerritoriesService],
})
export class TerritoriesModule {}
