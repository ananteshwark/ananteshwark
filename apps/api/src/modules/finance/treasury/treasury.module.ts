import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashPosition } from './entities/cash-position.entity';
import { BankGuarantee } from './entities/bank-guarantee.entity';
import { FinancialInstrument } from './entities/financial-instrument.entity';
import { SweepRule } from './entities/sweep-rule.entity';
import { SweepLog } from './entities/sweep-log.entity';
import { BankAccount } from '../bank/entities/bank-account.entity';
import { Bill } from '../ap/entities/bill.entity';
import { Invoice } from '../ar/entities/invoice.entity';
import { TreasuryService } from './treasury.service';
import { TreasuryController } from './treasury.controller';
import { GlModule } from '../gl/gl.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CashPosition,
      BankGuarantee,
      FinancialInstrument,
      SweepRule,
      SweepLog,
      BankAccount,
      Bill,
      Invoice,
    ]),
    GlModule,
    RbacModule,
  ],
  controllers: [TreasuryController],
  providers: [TreasuryService],
  exports: [TreasuryService],
})
export class TreasuryModule {}
