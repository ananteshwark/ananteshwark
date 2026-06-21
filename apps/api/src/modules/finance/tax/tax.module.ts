import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxCode } from './entities/tax-code.entity';
import { TaxLine } from './entities/tax-line.entity';
import { TaxService } from './tax.service';
import { TaxController } from './tax.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([TaxCode, TaxLine]), RbacModule],
  controllers: [TaxController],
  providers: [TaxService],
  exports: [TaxService],
})
export class TaxModule {}
