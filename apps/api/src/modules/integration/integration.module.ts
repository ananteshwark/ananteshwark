import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationAdapter } from './entities/integration-adapter.entity';
import { IntegrationEvent } from './entities/integration-event.entity';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IntegrationAdapter, IntegrationEvent]),
    RbacModule,
  ],
  controllers: [IntegrationController],
  providers: [IntegrationService],
  exports: [IntegrationService],
})
export class IntegrationFrameworkModule {}
