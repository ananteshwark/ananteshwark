import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from './entities/bank-account.entity';
import { BankTransaction } from './entities/bank-transaction.entity';
import { BankReconciliation } from './entities/bank-reconciliation.entity';
import { BankService } from './bank.service';
import { BankController } from './bank.controller';
import { GlModule } from '../gl/gl.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BankAccount, BankTransaction, BankReconciliation]),
    GlModule,
    RbacModule,
  ],
  controllers: [BankController],
  providers: [BankService],
  exports: [BankService],
})
export class BankModule {}
