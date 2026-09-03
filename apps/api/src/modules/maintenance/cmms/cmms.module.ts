import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkOrderPart } from './entities/work-order-part.entity';
import { AssetWarranty } from './entities/asset-warranty.entity';
import { MaintenanceOrder } from '../entities/maintenance-order.entity';
import { CmmsService } from './cmms.service';
import { CmmsController } from './cmms.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkOrderPart, AssetWarranty, MaintenanceOrder]),
    RbacModule,
  ],
  controllers: [CmmsController],
  providers: [CmmsService],
  exports: [CmmsService],
})
export class CmmsModule {}
