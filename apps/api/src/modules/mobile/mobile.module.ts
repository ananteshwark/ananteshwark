import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MobileCheckin } from './entities/mobile-checkin.entity';
import { MobileService } from './mobile.service';
import { MobileController } from './mobile.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MobileCheckin]),
    RbacModule,
  ],
  controllers: [MobileController],
  providers: [MobileService],
  exports: [MobileService],
})
export class MobileModule {}
