import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import { CampaignMember } from './entities/campaign-member.entity';
import { LeadScore } from './entities/lead-score.entity';
import { NurtureFlow } from './entities/nurture-flow.entity';
import { MarketingService } from './marketing.service';
import { MarketingController } from './marketing.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, CampaignMember, LeadScore, NurtureFlow]),
    RbacModule,
  ],
  controllers: [MarketingController],
  providers: [MarketingService],
  exports: [MarketingService],
})
export class MarketingModule {}
