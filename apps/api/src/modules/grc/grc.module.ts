import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SodRule } from './entities/sod-rule.entity';
import { GrcControl } from './entities/grc-control.entity';
import { RiskEntry } from './entities/risk-entry.entity';
import { GrcService } from './grc.service';
import { GrcController } from './grc.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SodRule, GrcControl, RiskEntry]),
    RbacModule,
  ],
  controllers: [GrcController],
  providers: [GrcService],
  exports: [GrcService],
})
export class GrcModule {}
