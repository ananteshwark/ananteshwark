import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from './entities/contract.entity';
import { ContractMilestone } from './entities/contract-milestone.entity';
import { ContractTemplate } from './entities/contract-template.entity';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contract, ContractMilestone, ContractTemplate]),
    RbacModule,
  ],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
