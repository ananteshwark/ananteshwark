import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IcPlan } from './entities/ic-plan.entity';
import { IcTransaction } from './entities/ic-transaction.entity';
import { IcDispute } from './entities/ic-dispute.entity';
import { IncentiveService } from './incentive.service';
import { IncentiveController } from './incentive.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IcPlan, IcTransaction, IcDispute]),
    RbacModule,
  ],
  controllers: [IncentiveController],
  providers: [IncentiveService],
  exports: [IncentiveService],
})
export class IncentiveModule {}
