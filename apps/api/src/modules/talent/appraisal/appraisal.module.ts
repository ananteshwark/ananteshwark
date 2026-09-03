import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppraisalResult } from './entities/appraisal-result.entity';
import { AppraisalService } from './appraisal.service';
import { AppraisalController } from './appraisal.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([AppraisalResult]), RbacModule],
  controllers: [AppraisalController],
  providers: [AppraisalService],
  exports: [AppraisalService],
})
export class AppraisalModule {}
