import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LandedCostDoc } from './landed-cost.entity';
import { Grn } from '../grn/entities/grn.entity';
import { GrnLine } from '../grn/entities/grn-line.entity';
import { PoLine } from '../po/entities/po-line.entity';
import { LandedCostService } from './landed-cost.service';
import { LandedCostController } from './landed-cost.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([LandedCostDoc, Grn, GrnLine, PoLine]), RbacModule],
  controllers: [LandedCostController],
  providers: [LandedCostService],
  exports: [LandedCostService],
})
export class LandedCostModule {}
