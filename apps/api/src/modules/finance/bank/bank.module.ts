import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from './entities/bank-account.entity';
import { BankTransaction } from './entities/bank-transaction.entity';
import { BankReconciliation } from './entities/bank-reconciliation.entity';
import { BankStatementImport } from './entities/bank-statement-import.entity';
import { ImportedBankLine } from './entities/imported-bank-line.entity';
import { VendorPayment } from '../ap/entities/vendor-payment.entity';
import { CustomerReceipt } from '../ar/entities/customer-receipt.entity';
import { BankService } from './bank.service';
import { BankImportService } from './bank-import.service';
import { BankController } from './bank.controller';
import { GlModule } from '../gl/gl.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankAccount,
      BankTransaction,
      BankReconciliation,
      BankStatementImport,
      ImportedBankLine,
      VendorPayment,
      CustomerReceipt,
    ]),
    GlModule,
    RbacModule,
  ],
  controllers: [BankController],
  providers: [BankService, BankImportService],
  exports: [BankService, BankImportService],
})
export class BankModule {}
