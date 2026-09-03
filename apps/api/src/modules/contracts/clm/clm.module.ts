import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractClause } from './entities/contract-clause.entity';
import { ClauseDeviation } from './entities/clause-deviation.entity';
import { SignatureEnvelope } from './entities/signature-envelope.entity';
import { Contract } from '../entities/contract.entity';
import { ClmService } from './clm.service';
import { ClmController } from './clm.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContractClause, ClauseDeviation, SignatureEnvelope, Contract]),
    RbacModule,
  ],
  controllers: [ClmController],
  providers: [ClmService],
  exports: [ClmService],
})
export class ClmModule {}
