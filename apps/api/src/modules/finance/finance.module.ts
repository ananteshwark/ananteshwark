import { Module } from '@nestjs/common';
import { GlModule } from './gl/gl.module';
import { ApModule } from './ap/ap.module';
import { ArModule } from './ar/ar.module';
import { BankModule } from './bank/bank.module';
import { ReportsModule } from './reports/reports.module';
import { FixedAssetsModule } from './fixed-assets/fixed-assets.module';
import { DunningModule } from './dunning/dunning.module';
import { CurrencyModule } from './currency/currency.module';
import { TaxModule } from './tax/tax.module';
import { ControllingModule } from './controlling/controlling.module';
import { GrirModule } from './grir/grir.module';
import { PaymentRunModule } from './payment-run/payment-run.module';
import { AdvancesModule } from './advances/advances.module';
import { BudgetModule } from './budget/budget.module';
import { IntercompanyModule } from './intercompany/intercompany.module';

@Module({
  imports: [
    GlModule,
    ApModule,
    ArModule,
    BankModule,
    ReportsModule,
    FixedAssetsModule,
    DunningModule,
    CurrencyModule,
    TaxModule,
    ControllingModule,
    GrirModule,
    PaymentRunModule,
    AdvancesModule,
    BudgetModule,
    IntercompanyModule,
  ],
  exports: [TaxModule, ControllingModule, GrirModule, AdvancesModule, BudgetModule, IntercompanyModule],
})
export class FinanceModule {}
