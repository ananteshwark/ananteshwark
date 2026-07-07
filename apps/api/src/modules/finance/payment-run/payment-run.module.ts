import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentRun } from './entities/payment-run.entity';
import { PaymentRunItem } from './entities/payment-run-item.entity';
import { Bill } from '../ap/entities/bill.entity';
import { Vendor } from '../ap/entities/vendor.entity';
import { PaymentRunService } from './payment-run.service';
import { Iso20022Service } from './iso20022.service';
import { PaymentRunController } from './payment-run.controller';
import { ApModule } from '../ap/ap.module';
import { CashDiscountModule } from '../cash-discount/cash-discount.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentRun, PaymentRunItem, Bill, Vendor]),
    ApModule,
    CashDiscountModule,
    RbacModule,
  ],
  controllers: [PaymentRunController],
  providers: [PaymentRunService, Iso20022Service],
  exports: [PaymentRunService],
})
export class PaymentRunModule {}
