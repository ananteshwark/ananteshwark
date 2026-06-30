import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CpqProductModel } from './entities/cpq-product-model.entity';
import { CpqQuote } from './entities/cpq-quote.entity';
import { CpqGuidedQuestionnaire } from './entities/cpq-guided-questionnaire.entity';
import { SalesOrder } from '../entities/sales-order.entity';
import { SalesOrderLine } from '../entities/sales-order-line.entity';
import { CpqService } from './cpq.service';
import { CpqController } from './cpq.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CpqProductModel, CpqQuote, CpqGuidedQuestionnaire, SalesOrder, SalesOrderLine]),
    RbacModule,
  ],
  controllers: [CpqController],
  providers: [CpqService],
  exports: [CpqService],
})
export class CpqModule {}
