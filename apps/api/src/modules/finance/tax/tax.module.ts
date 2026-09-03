import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxCode } from './entities/tax-code.entity';
import { TaxLine } from './entities/tax-line.entity';
import { ZxRegime, ZxTax, ZxStatus, ZxRate } from './entities/zx-hierarchy.entity';
import { ZxRule } from './entities/zx-rule.entity';
import { ZxRegistration } from './entities/zx-registration.entity';
import { TaxService } from './tax.service';
import { ZxTaxService } from './zx-tax.service';
import { TaxController } from './tax.controller';
import { ZxTaxController } from './zx-tax.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TaxCode,
      TaxLine,
      ZxRegime,
      ZxTax,
      ZxStatus,
      ZxRate,
      ZxRule,
      ZxRegistration,
    ]),
    RbacModule,
  ],
  controllers: [TaxController, ZxTaxController],
  providers: [TaxService, ZxTaxService],
  exports: [TaxService, ZxTaxService],
})
export class TaxModule {}
