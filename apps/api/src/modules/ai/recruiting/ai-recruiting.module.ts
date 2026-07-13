import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CvParseUsage } from './entities/cv-parse-usage.entity';
import { AiRecruitingService } from './ai-recruiting.service';
import { AiRecruitingController } from './ai-recruiting.controller';
import { RbacModule } from '../../rbac/rbac.module';
import { LicensingModule } from '../../licensing/licensing.module';

@Module({
  imports: [TypeOrmModule.forFeature([CvParseUsage]), RbacModule, LicensingModule],
  controllers: [AiRecruitingController],
  providers: [AiRecruitingService],
  exports: [AiRecruitingService],
})
export class AiRecruitingModule {}
