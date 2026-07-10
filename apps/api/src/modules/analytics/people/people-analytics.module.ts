import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsLicense, AnalyticsSeatPolicy, AnalyticsMetric, Storyboard } from './entities/people-analytics.entity';
import { PeopleAnalyticsService } from './people-analytics.service';
import { PeopleAnalyticsController } from './people-analytics.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([AnalyticsLicense, AnalyticsSeatPolicy, AnalyticsMetric, Storyboard]), RbacModule],
  controllers: [PeopleAnalyticsController],
  providers: [PeopleAnalyticsService],
  exports: [PeopleAnalyticsService],
})
export class PeopleAnalyticsModule {}
