import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey, LookupTable, LookupRow } from './entities/studio.entity';
import { StudioService } from './studio.service';
import { StudioController } from './studio.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey, LookupTable, LookupRow]), RbacModule],
  controllers: [StudioController],
  providers: [StudioService],
  exports: [StudioService],
})
export class StudioModule {}
