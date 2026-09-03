import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelSubscription, ChannelDelivery } from './entities/channel.entity';
import { RewardCatalogItem, RewardRedemption } from './entities/reward.entity';
import { ChannelDispatchService } from './channel-dispatch.service';
import { RewardStoreService } from './reward-store.service';
import { ChannelAdapter } from './channel.adapter';
import { RewardFulfillmentAdapter } from './reward.adapter';
import { ChannelsController } from './channels.controller';
import { RbacModule } from '../../rbac/rbac.module';
import { EngagementModule } from '../../engagement/engagement.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChannelSubscription, ChannelDelivery, RewardCatalogItem, RewardRedemption]),
    RbacModule,
    EngagementModule,
  ],
  controllers: [ChannelsController],
  providers: [ChannelDispatchService, RewardStoreService, ChannelAdapter, RewardFulfillmentAdapter],
  exports: [ChannelDispatchService, RewardStoreService],
})
export class ChannelsModule {}
