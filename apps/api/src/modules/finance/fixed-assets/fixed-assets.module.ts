import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetCategory } from './entities/asset-category.entity';
import { FixedAsset } from './entities/fixed-asset.entity';
import { DepreciationRun, DepreciationRunLine } from './entities/depreciation-run.entity';
import { FixedAssetsService } from './fixed-assets.service';
import { FixedAssetsController } from './fixed-assets.controller';
import { GlModule } from '../gl/gl.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AssetCategory, FixedAsset, DepreciationRun, DepreciationRunLine]),
    GlModule,
    RbacModule,
  ],
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService],
  exports: [FixedAssetsService],
})
export class FixedAssetsModule {}
