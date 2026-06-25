import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { Invoice } from './entities/invoice.entity';
import { InvoiceLine } from './entities/invoice-line.entity';
import { CustomerReceipt } from './entities/customer-receipt.entity';
import { ReceiptAllocation } from './entities/receipt-allocation.entity';
import { BankAccount } from '../bank/entities/bank-account.entity';
import { ArService } from './ar.service';
import { ArController } from './ar.controller';
import { GlModule } from '../gl/gl.module';
import { CurrencyModule } from '../currency/currency.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Invoice, InvoiceLine, CustomerReceipt, ReceiptAllocation, BankAccount]),
    GlModule,
    CurrencyModule,
    RbacModule,
  ],
  controllers: [ArController],
  providers: [ArService],
  exports: [ArService, TypeOrmModule],
  // SlaService is provided via GlModule (already imported above)
})
export class ArModule {}
