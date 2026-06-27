import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StandardCost } from './entities/standard-cost.entity';
import { CostVariance } from './entities/cost-variance.entity';
import { CostUpdate } from './entities/cost-update.entity';
import { StockBalance } from '../entities/stock-balance.entity';
import { Item } from '../entities/item.entity';
import { CostingService } from './costing.service';
import { CostingController } from './costing.controller';
import { GlModule } from '../../finance/gl/gl.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StandardCost, CostVariance, CostUpdate, StockBalance, Item]),
    GlModule,
    RbacModule,
  ],
  controllers: [CostingController],
  providers: [CostingService],
  exports: [CostingService],
})
export class CostingModule {}
