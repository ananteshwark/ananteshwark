import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalDelegation } from './entities/approval-delegation.entity';
import { DelegationService } from './delegation.service';
import { DelegationController } from './delegation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ApprovalDelegation])],
  controllers: [DelegationController],
  providers: [DelegationService],
  exports: [DelegationService],
})
export class DelegationModule {}
