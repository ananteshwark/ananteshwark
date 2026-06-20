import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DunningLevel } from './entities/dunning-level.entity';
import { DunningRun, DunningLetter } from './entities/dunning-run.entity';
import { PaymentPlan } from './entities/payment-plan.entity';
import { DunningService } from './dunning.service';
import { DunningController } from './dunning.controller';
import { ArModule } from '../ar/ar.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DunningLevel, DunningRun, DunningLetter, PaymentPlan]),
    ArModule,
    RbacModule,
  ],
  controllers: [DunningController],
  providers: [DunningService],
  exports: [DunningService],
})
export class DunningModule {}
