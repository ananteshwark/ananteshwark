import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourceList } from './entities/source-list.entity';
import { QuotaArrangement } from './entities/quota-arrangement.entity';
import { SourceDeterminationService } from './source-determination.service';
import { SourceDeterminationController } from './source-determination.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SourceList, QuotaArrangement]),
    RbacModule,
  ],
  controllers: [SourceDeterminationController],
  providers: [SourceDeterminationService],
  exports: [SourceDeterminationService],
})
export class SourceDeterminationModule {}
