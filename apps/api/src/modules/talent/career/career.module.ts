import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobFamily, CareerLadder, CareerPath } from './entities/career-architecture.entity';
import { TalentPool, TalentPoolMember } from './entities/talent-pool.entity';
import { TalentReview, NineBoxPlacement } from './entities/talent-review.entity';
import { CareerService } from './career.service';
import { CareerController } from './career.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([JobFamily, CareerLadder, CareerPath, TalentPool, TalentPoolMember, TalentReview, NineBoxPlacement]),
    RbacModule,
  ],
  controllers: [CareerController],
  providers: [CareerService],
  exports: [CareerService],
})
export class CareerModule {}
