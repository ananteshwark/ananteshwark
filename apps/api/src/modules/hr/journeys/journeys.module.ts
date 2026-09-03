import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JourneyTemplate, JourneyInstance, JourneyStepInstance } from './entities/journey.entity';
import { JourneysService } from './journeys.service';
import { JourneysController } from './journeys.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([JourneyTemplate, JourneyInstance, JourneyStepInstance]), RbacModule],
  controllers: [JourneysController],
  providers: [JourneysService],
  exports: [JourneysService],
})
export class JourneysModule {}
