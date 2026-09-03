import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashPosition } from './entities/cash-position.entity';
import { BankGuarantee } from './entities/bank-guarantee.entity';
import { FinancialInstrument } from './entities/financial-instrument.entity';
import { SweepRule } from './entities/sweep-rule.entity';
import { SweepLog } from './entities/sweep-log.entity';
import { CashForecast, CashForecastLine } from './entities/cash-forecast.entity';
import { BankAccount } from '../bank/entities/bank-account.entity';
import { BankTransaction } from '../bank/entities/bank-transaction.entity';
import { Bill } from '../ap/entities/bill.entity';
import { Invoice } from '../ar/entities/invoice.entity';
import { PayrollRun } from '../../payroll/runs/entities/payroll-run.entity';
import { TreasuryService } from './treasury.service';
import { CashForecastService } from './cash-forecast.service';
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
      CashForecast,
      CashForecastLine,
      BankAccount,
      BankTransaction,
      Bill,
      Invoice,
      PayrollRun,
    ]),
    GlModule,
    RbacModule,
  ],
  controllers: [TreasuryController],
  providers: [TreasuryService, CashForecastService],
  exports: [TreasuryService, CashForecastService],
})
export class TreasuryModule {}
