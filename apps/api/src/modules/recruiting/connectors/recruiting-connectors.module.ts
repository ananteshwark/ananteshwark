import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecruitingConnector, JobPublication, AssessmentOrder } from './entities/connector.entity';
import { RecruitingConnectorsService } from './recruiting-connectors.service';
import { RecruitingConnectorsController } from './recruiting-connectors.controller';
import { ConnectorAdapter } from './connector.adapter';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([RecruitingConnector, JobPublication, AssessmentOrder]), RbacModule],
  controllers: [RecruitingConnectorsController],
  providers: [RecruitingConnectorsService, ConnectorAdapter],
  exports: [RecruitingConnectorsService],
})
export class RecruitingConnectorsModule {}
