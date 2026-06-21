import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bill } from './entities/bill.entity';
import { BillService } from './bill.service';
import { BillController } from './bill.controller';
import { TaxModule } from '../tax/tax.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([Bill]), TaxModule, RbacModule],
  controllers: [BillController],
  providers: [BillService],
  exports: [BillService],
})
export class ApModule {}
