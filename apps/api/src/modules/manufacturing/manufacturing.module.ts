import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bom, BomLine } from './entities/bom.entity';
import { WorkCenter } from './entities/work-center.entity';
import { ProductionOrder, MaterialIssuance } from './entities/production-order.entity';
import { ManufacturingService } from './manufacturing.service';
import { ManufacturingController } from './manufacturing.controller';
import { GlModule } from '../finance/gl/gl.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Bom, BomLine, WorkCenter, ProductionOrder, MaterialIssuance]),
    GlModule,
    RbacModule,
  ],
  controllers: [ManufacturingController],
  providers: [ManufacturingService],
  exports: [ManufacturingService],
})
export class ManufacturingModule {}
