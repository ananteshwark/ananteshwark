import { Module } from '@nestjs/common';
import { GlModule } from './gl/gl.module';
import { ApModule } from './ap/ap.module';
import { ArModule } from './ar/ar.module';
import { BankModule } from './bank/bank.module';
import { ReportsModule } from './reports/reports.module';
import { FixedAssetsModule } from './fixed-assets/fixed-assets.module';

@Module({
  imports: [GlModule, ApModule, ArModule, BankModule, ReportsModule, FixedAssetsModule],
})
export class FinanceModule {}
