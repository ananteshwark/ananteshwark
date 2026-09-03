import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorAdvance } from './entities/vendor-advance.entity';
import { CustomerAdvance } from './entities/customer-advance.entity';
import { AdvancesService } from './advances.service';
import { AdvancesController } from './advances.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VendorAdvance, CustomerAdvance]),
    RbacModule,
  ],
  controllers: [AdvancesController],
  providers: [AdvancesService],
  exports: [AdvancesService],
})
export class AdvancesModule {}
