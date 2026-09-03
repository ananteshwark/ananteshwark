import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuccessionPlan } from './entities/succession-plan.entity';
import { SuccessorCandidate } from './entities/successor-candidate.entity';
import { SuccessionService } from './succession.service';
import { SuccessionController } from './succession.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([SuccessionPlan, SuccessorCandidate]), RbacModule],
  controllers: [SuccessionController],
  providers: [SuccessionService],
  exports: [SuccessionService],
})
export class SuccessionModule {}
