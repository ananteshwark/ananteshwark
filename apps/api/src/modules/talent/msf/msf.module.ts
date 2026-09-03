import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MsfCampaign, MsfRater, MsfResponse } from './entities/msf-campaign.entity';
import { PromotionCase, AchievementMatrix } from './entities/promotion.entity';
import { MsfService } from './msf.service';
import { PromotionService } from './promotion.service';
import { MsfController } from './msf.controller';
import { PromotionController } from './promotion.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MsfCampaign, MsfRater, MsfResponse, PromotionCase, AchievementMatrix]),
    RbacModule,
  ],
  controllers: [MsfController, PromotionController],
  providers: [MsfService, PromotionService],
  exports: [MsfService, PromotionService],
})
export class MsfModule {}
