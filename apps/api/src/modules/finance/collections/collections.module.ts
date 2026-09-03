import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionNote } from './entities/collection-note.entity';
import { PromiseToPay } from './entities/promise-to-pay.entity';
import { Dispute } from './entities/dispute.entity';
import { Invoice } from '../ar/entities/invoice.entity';
import { Customer } from '../ar/entities/customer.entity';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CollectionNote, PromiseToPay, Dispute, Invoice, Customer]),
    RbacModule,
  ],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
