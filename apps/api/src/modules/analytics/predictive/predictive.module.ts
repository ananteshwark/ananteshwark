import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PredictiveScore } from './entities/predictive-score.entity';
import { PredictiveService } from './predictive.service';
import { PredictiveController } from './predictive.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PredictiveScore]),
    RbacModule,
  ],
  controllers: [PredictiveController],
  providers: [PredictiveService],
  exports: [PredictiveService],
})
export class PredictiveModule {}
