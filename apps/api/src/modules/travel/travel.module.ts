import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TravelRequest } from './entities/travel-request.entity';
import { TravelComment } from './entities/travel-comment.entity';
import { TravelService } from './travel.service';
import { TravelController } from './travel.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([TravelRequest, TravelComment]), RbacModule],
  controllers: [TravelController],
  providers: [TravelService],
  exports: [TravelService],
})
export class TravelModule {}
