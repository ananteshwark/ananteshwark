import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpendSummary } from './entities/spend-summary.entity';
import { SavingsRecord } from './entities/savings-record.entity';
import { PurchaseOrder } from '../po/entities/purchase-order.entity';
import { SpendAnalysisService } from './spend-analysis.service';
import { SpendAnalysisController } from './spend-analysis.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SpendSummary, SavingsRecord, PurchaseOrder]),
    RbacModule,
  ],
  controllers: [SpendAnalysisController],
  providers: [SpendAnalysisService],
  exports: [SpendAnalysisService],
})
export class SpendAnalysisModule {}
