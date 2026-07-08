import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobRecord } from './job-record.entity';
import { JobsService } from './jobs.service';

// Global so any module can enqueue durable work or register a handler
// without importing this module explicitly.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([JobRecord])],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
