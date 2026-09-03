import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationQualityPlan } from './entities/operation-quality-plan.entity';
import { OperationQualityResult } from './entities/operation-quality-result.entity';
import { OpQualityService } from './op-quality.service';
import { OpQualityController } from './op-quality.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OperationQualityPlan, OperationQualityResult]),
    RbacModule,
  ],
  controllers: [OpQualityController],
  providers: [OpQualityService],
  exports: [OpQualityService],
})
export class OpQualityModule {}
