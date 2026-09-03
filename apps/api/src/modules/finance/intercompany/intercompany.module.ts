import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IcRelationship } from './entities/ic-relationship.entity';
import { IcTransaction } from './entities/ic-transaction.entity';
import { IcTransferPrice } from './entities/ic-transfer-price.entity';
import { LegalEntity } from '../../hr/employees/entities/legal-entity.entity';
import { Account } from '../gl/entities/account.entity';
import { ConsolidationGroup } from '../consolidation/entities/consolidation-group.entity';
import { IntercompanyService } from './intercompany.service';
import { TransferPricingService } from './transfer-pricing.service';
import { IcBillingService } from './ic-billing.service';
import { IntercompanyController } from './intercompany.controller';
import { RbacModule } from '../../rbac/rbac.module';
import { ArModule } from '../ar/ar.module';
import { ApModule } from '../ap/ap.module';
import { GlModule } from '../gl/gl.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IcRelationship,
      IcTransaction,
      IcTransferPrice,
      LegalEntity,
      Account,
      ConsolidationGroup,
    ]),
    RbacModule,
    ArModule,
    ApModule,
    GlModule,
  ],
  controllers: [IntercompanyController],
  providers: [IntercompanyService, TransferPricingService, IcBillingService],
  exports: [IntercompanyService, TransferPricingService, IcBillingService],
})
export class IntercompanyModule {}
