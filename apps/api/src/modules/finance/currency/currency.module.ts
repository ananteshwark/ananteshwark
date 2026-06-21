import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Currency } from './entities/currency.entity';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { Bill } from '../ap/entities/bill.entity';
import { Invoice } from '../ar/entities/invoice.entity';
import { CurrencyService } from './currency.service';
import { CurrencyController } from './currency.controller';
import { GlModule } from '../gl/gl.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Currency, ExchangeRate, Bill, Invoice]),
    GlModule,
    RbacModule,
  ],
  controllers: [CurrencyController],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
