import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vendor } from './entities/vendor.entity';
import { Bill } from './entities/bill.entity';
import { BillLine } from './entities/bill-line.entity';
import { VendorPayment } from './entities/vendor-payment.entity';
import { PaymentAllocation } from './entities/payment-allocation.entity';
import { ApHold } from './entities/ap-hold.entity';
import { ApWhtCode } from './entities/ap-wht-code.entity';
import { WhtCertificate } from './entities/wht-certificate.entity';
import { BankAccount } from '../bank/entities/bank-account.entity';
import { ApService } from './ap.service';
import { ApHoldService } from './ap-hold.service';
import { WhtService } from './wht.service';
import { ApController } from './ap.controller';
import { GlModule } from '../gl/gl.module';
import { CurrencyModule } from '../currency/currency.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Vendor,
      Bill,
      BillLine,
      VendorPayment,
      PaymentAllocation,
      ApHold,
      ApWhtCode,
      WhtCertificate,
      BankAccount,
    ]),
    GlModule,
    CurrencyModule,
    RbacModule,
  ],
  controllers: [ApController],
  providers: [ApService, ApHoldService, WhtService],
  exports: [ApService, ApHoldService, WhtService],
})
export class ApModule {}
