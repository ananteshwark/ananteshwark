import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LockboxBatch } from './entities/lockbox-batch.entity';
import { LockboxReceipt } from './entities/lockbox-receipt.entity';
import { Invoice } from '../ar/entities/invoice.entity';
import { Customer } from '../ar/entities/customer.entity';
import { LockboxService } from './lockbox.service';
import { LockboxController } from './lockbox.controller';
import { ArModule } from '../ar/ar.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LockboxBatch, LockboxReceipt, Invoice, Customer]),
    ArModule,
    RbacModule,
  ],
  controllers: [LockboxController],
  providers: [LockboxService],
  exports: [LockboxService],
})
export class LockboxModule {}
