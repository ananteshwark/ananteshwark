import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchasingInfoRecord } from './entities/purchasing-info-record.entity';
import { InfoRecordService } from './info-record.service';
import { InfoRecordController } from './info-record.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([PurchasingInfoRecord]), RbacModule],
  controllers: [InfoRecordController],
  providers: [InfoRecordService],
  exports: [InfoRecordService],
})
export class InfoRecordModule {}
