import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationScript, ScheduledJob, ApiDefinition } from './entities/integration.entity';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { DeliveryAdapter } from './delivery.adapter';
import { StudioModule } from '../studio.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([IntegrationScript, ScheduledJob, ApiDefinition]), StudioModule, RbacModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, DeliveryAdapter],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
