import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtlTimeRule } from './entities/otl-time-rule.entity';
import { OtlTimecardResult } from './entities/otl-timecard-result.entity';
import { OtlService } from './otl.service';
import { OtlController } from './otl.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OtlTimeRule, OtlTimecardResult]),
    RbacModule,
  ],
  controllers: [OtlController],
  providers: [OtlService],
  exports: [OtlService],
})
export class OtlModule {}
