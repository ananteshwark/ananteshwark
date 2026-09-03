import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetCategory } from './entities/asset-category.entity';
import { FixedAsset } from './entities/fixed-asset.entity';
import { DepreciationRun, DepreciationRunLine } from './entities/depreciation-run.entity';
import { AssetDepreciationArea } from './entities/asset-depreciation-area.entity';
import { CipAsset } from './entities/cip-asset.entity';
import { Account } from '../gl/entities/account.entity';
import { FixedAssetsService } from './fixed-assets.service';
import { FaLifecycleService } from './fa-lifecycle.service';
import { FixedAssetsController } from './fixed-assets.controller';
import { GlModule } from '../gl/gl.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AssetCategory, FixedAsset, DepreciationRun, DepreciationRunLine, AssetDepreciationArea, CipAsset, Account]),
    GlModule,
    RbacModule,
  ],
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService, FaLifecycleService],
  exports: [FixedAssetsService, FaLifecycleService],
})
export class FixedAssetsModule {}
