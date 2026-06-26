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
import { ConsolidationModule } from './consolidation/consolidation.module';
import { TreasuryModule } from './treasury/treasury.module';
import { LedgersModule } from './ledgers/ledgers.module';
import { CashDiscountModule } from './cash-discount/cash-discount.module';
import { RevenueRecognitionModule } from './revenue-recognition/revenue-recognition.module';
import { LeaseModule } from './lease/lease.module';
import { CollectionsModule } from './collections/collections.module';

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
    ConsolidationModule,
    TreasuryModule,
    LedgersModule,
    CashDiscountModule,
    RevenueRecognitionModule,
    LeaseModule,
    CollectionsModule,
  ],
  exports: [TaxModule, ControllingModule, GrirModule, AdvancesModule, BudgetModule, IntercompanyModule, ConsolidationModule, TreasuryModule],
})
export class FinanceModule {}
