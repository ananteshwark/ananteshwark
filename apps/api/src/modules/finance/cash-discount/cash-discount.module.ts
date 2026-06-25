import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentTerm } from './entities/payment-term.entity';
import { CashDiscount } from './entities/cash-discount.entity';
import { CashDiscountService } from './cash-discount.service';
import { CashDiscountController } from './cash-discount.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentTerm, CashDiscount]),
    RbacModule,
  ],
  controllers: [CashDiscountController],
  providers: [CashDiscountService],
  exports: [CashDiscountService],
})
export class CashDiscountModule {}
