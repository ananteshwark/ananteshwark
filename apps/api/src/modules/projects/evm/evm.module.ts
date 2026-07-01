import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvmBaseline } from './entities/evm-baseline.entity';
import { EvmBaselineLine } from './entities/evm-baseline-line.entity';
import { EvmMeasurement } from './entities/evm-measurement.entity';
import { EvmService } from './evm.service';
import { EvmController } from './evm.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EvmBaseline, EvmBaselineLine, EvmMeasurement]),
    RbacModule,
  ],
  controllers: [EvmController],
  providers: [EvmService],
  exports: [EvmService],
})
export class EvmModule {}
