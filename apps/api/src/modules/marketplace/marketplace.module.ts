import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplaceListing } from './entities/marketplace-listing.entity';
import { ExtensionInstall } from './entities/extension-install.entity';
import { CustomObject } from '../extensibility/entities/custom-object.entity';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { ExtensibilityModule } from '../extensibility/extensibility.module';
import { WebhooksModule } from '../platform/webhooks/webhooks.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketplaceListing, ExtensionInstall, CustomObject]),
    ExtensibilityModule,
    WebhooksModule,
    RbacModule,
  ],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
