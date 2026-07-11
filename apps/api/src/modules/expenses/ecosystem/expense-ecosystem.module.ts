import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardFeed, CardTransaction, TripImport } from './entities/ecosystem.entity';
import { ExpenseEcosystemService } from './expense-ecosystem.service';
import { ExpenseEcosystemController } from './expense-ecosystem.controller';
import { FeedPullAdapter } from './feed-pull.adapter';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([CardFeed, CardTransaction, TripImport]), RbacModule],
  controllers: [ExpenseEcosystemController],
  providers: [ExpenseEcosystemService, FeedPullAdapter],
  exports: [ExpenseEcosystemService],
})
export class ExpenseEcosystemModule {}
