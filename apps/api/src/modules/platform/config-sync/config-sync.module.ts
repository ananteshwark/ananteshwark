import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigSnapshot } from './entities/config-snapshot.entity';
import { ConfigSyncService } from './config-sync.service';
import { ConfigSyncController } from './config-sync.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([ConfigSnapshot]), RbacModule],
  controllers: [ConfigSyncController],
  providers: [ConfigSyncService],
  exports: [ConfigSyncService],
})
export class ConfigSyncModule {}
