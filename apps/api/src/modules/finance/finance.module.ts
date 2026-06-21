import { Module } from '@nestjs/common';
import { TaxModule } from './tax/tax.module';
import { ApModule } from './ap/ap.module';
import { ArModule } from './ar/ar.module';

@Module({
  imports: [TaxModule, ApModule, ArModule],
  exports: [TaxModule, ApModule, ArModule],
})
export class FinanceModule {}
