import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatutoryConfig } from './entities/statutory-config.entity';
import { TaxSlab } from './entities/tax-slab.entity';
import { Form16 } from './entities/form16.entity';
import { ComplianceCalendarItem } from './entities/compliance-calendar-item.entity';
import { TdsReturn } from './entities/tds-return.entity';
import { GratuitySettlement } from './entities/gratuity-settlement.entity';
import { StatutoryService } from './statutory.service';
import { StatutoryController } from './statutory.controller';
import { RbacModule } from '../../rbac/rbac.module';
import { LocalizationModule } from '../../localization/localization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StatutoryConfig,
      TaxSlab,
      Form16,
      ComplianceCalendarItem,
      TdsReturn,
      GratuitySettlement,
    ]),
    RbacModule,
    LocalizationModule,
  ],
  controllers: [StatutoryController],
  providers: [StatutoryService],
  exports: [StatutoryService],
})
export class StatutoryModule {}
