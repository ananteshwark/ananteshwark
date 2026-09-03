import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerLease } from './scheduler-lease.entity';
import { LeaseService } from './lease.service';

// Global so any module hosting a background job can inject LeaseService
// without importing this module explicitly.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SchedulerLease])],
  providers: [LeaseService],
  exports: [LeaseService],
})
export class LeasesModule {}
