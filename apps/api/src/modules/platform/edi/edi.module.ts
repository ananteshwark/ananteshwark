import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EdiTradingPartner } from './entities/edi-trading-partner.entity';
import { EdiTransaction } from './entities/edi-transaction.entity';
import { EdiService } from './edi.service';
import { EdiController } from './edi.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EdiTradingPartner, EdiTransaction]),
    RbacModule,
  ],
  controllers: [EdiController],
  providers: [EdiService],
  exports: [EdiService],
})
export class EdiModule {}
