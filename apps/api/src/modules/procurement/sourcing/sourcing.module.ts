import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourcingEvent } from './entities/sourcing-event.entity';
import { SourcingEventLine } from './entities/sourcing-event-line.entity';
import { SourcingBid } from './entities/sourcing-bid.entity';
import { SourcingAward } from './entities/sourcing-award.entity';
import { SourcingService } from './sourcing.service';
import { SourcingController } from './sourcing.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SourcingEvent, SourcingEventLine, SourcingBid, SourcingAward]),
    RbacModule,
  ],
  controllers: [SourcingController],
  providers: [SourcingService],
  exports: [SourcingService],
})
export class SourcingModule {}
