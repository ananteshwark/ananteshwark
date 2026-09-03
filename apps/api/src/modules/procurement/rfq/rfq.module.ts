import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rfq } from './entities/rfq.entity';
import { RfqLine } from './entities/rfq-line.entity';
import { RfqVendor } from './entities/rfq-vendor.entity';
import { RfqQuote } from './entities/rfq-quote.entity';
import { RfqService } from './rfq.service';
import { RfqController } from './rfq.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Rfq, RfqLine, RfqVendor, RfqQuote]),
    RbacModule,
  ],
  controllers: [RfqController],
  providers: [RfqService],
  exports: [RfqService],
})
export class RfqModule {}
