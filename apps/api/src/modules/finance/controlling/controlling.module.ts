import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfitCenter } from './entities/profit-center.entity';
import { CostAllocationCycle } from './entities/cost-allocation-cycle.entity';
import { CostAllocationEntry } from './entities/cost-allocation-entry.entity';
import { InternalOrder } from './entities/internal-order.entity';
import { ControllingService } from './controlling.service';
import { ControllingController } from './controlling.controller';
import { GlModule } from '../gl/gl.module';
import { CostCenter } from '../gl/entities/cost-center.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProfitCenter, CostAllocationCycle, CostAllocationEntry, InternalOrder]),
    GlModule, // exports GlService + TypeOrmModule (CostCenter repo is accessible via GlModule)
  ],
  controllers: [ControllingController],
  providers: [ControllingService],
  exports: [ControllingService],
})
export class ControllingModule {}
