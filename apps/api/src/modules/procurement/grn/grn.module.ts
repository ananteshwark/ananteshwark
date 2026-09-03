import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Grn } from './entities/grn.entity';
import { GrnLine } from './entities/grn-line.entity';
import { Bill } from '../../finance/ap/entities/bill.entity';
import { BillLine } from '../../finance/ap/entities/bill-line.entity';
import { Vendor } from '../../finance/ap/entities/vendor.entity';
import { Account } from '../../finance/gl/entities/account.entity';
import { GrnService } from './grn.service';
import { GrnController } from './grn.controller';
import { PoModule } from '../po/po.module';
import { GlModule } from '../../finance/gl/gl.module';
import { RbacModule } from '../../rbac/rbac.module';
import { GrirModule } from '../../finance/grir/grir.module';
import { InventoryModule } from '../../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Grn, GrnLine, Bill, BillLine, Vendor, Account]),
    PoModule,
    GlModule,
    RbacModule,
    GrirModule,
    InventoryModule,
  ],
  controllers: [GrnController],
  providers: [GrnService],
  exports: [GrnService],
})
export class GrnModule {}
