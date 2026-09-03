import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapitalProjectConfig } from './entities/capital-config.entity';
import { CapitalRule } from './entities/capital-rule.entity';
import { CipEntry } from './entities/cip-entry.entity';
import { CapitalService } from './capital.service';
import { CapitalController } from './capital.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CapitalProjectConfig, CapitalRule, CipEntry]),
    RbacModule,
  ],
  controllers: [CapitalController],
  providers: [CapitalService],
  exports: [CapitalService],
})
export class CapitalModule {}
