import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FaceEnrollment, MobileAppConfig, Visitor } from './entities/device.entity';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { FaceMatchAdapter } from './face-match.adapter';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([FaceEnrollment, MobileAppConfig, Visitor]), RbacModule],
  controllers: [DeviceController],
  providers: [DeviceService, FaceMatchAdapter],
  exports: [DeviceService],
})
export class DeviceModule {}
