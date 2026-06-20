import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FixedAssetsService } from './fixed-assets.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  CreateAssetCategoryDto, UpdateAssetCategoryDto,
  CreateFixedAssetDto, UpdateFixedAssetDto,
  DisposeAssetDto, RunDepreciationDto,
} from './dto/fixed-assets.dto';

@ApiTags('fixed-assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/fixed-assets')
export class FixedAssetsController {
  constructor(private readonly service: FixedAssetsService) {}

  // Asset Categories
  @Get('categories')
  @RequirePermission('finance:fixed-assets:read')
  listCategories(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listCategories(user.tenantId, pagination);
  }

  @Post('categories')
  @RequirePermission('finance:fixed-assets:manage')
  createCategory(@CurrentUser() user: any, @Body() dto: CreateAssetCategoryDto) {
    return this.service.createCategory(user.tenantId, dto);
  }

  @Patch('categories/:id')
  @RequirePermission('finance:fixed-assets:manage')
  updateCategory(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateAssetCategoryDto) {
    return this.service.updateCategory(user.tenantId, id, dto);
  }

  // Fixed Assets
  @Get()
  @RequirePermission('finance:fixed-assets:read')
  listAssets(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.service.listAssets(user.tenantId, pagination, { status, categoryId, search });
  }

  @Get(':id')
  @RequirePermission('finance:fixed-assets:read')
  getAsset(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findAsset(user.tenantId, id);
  }

  @Get(':id/schedule')
  @RequirePermission('finance:fixed-assets:read')
  getAssetSchedule(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getAssetSchedule(user.tenantId, id);
  }

  @Post()
  @RequirePermission('finance:fixed-assets:manage')
  createAsset(@CurrentUser() user: any, @Body() dto: CreateFixedAssetDto) {
    return this.service.createAsset(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('finance:fixed-assets:manage')
  updateAsset(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateFixedAssetDto) {
    return this.service.updateAsset(user.tenantId, id, dto);
  }

  @Post(':id/dispose')
  @RequirePermission('finance:fixed-assets:manage')
  disposeAsset(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: DisposeAssetDto) {
    return this.service.disposeAsset(user.tenantId, id, dto, user.id);
  }

  // Depreciation Runs
  @Get('depreciation-runs')
  @RequirePermission('finance:fixed-assets:read')
  listRuns(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listDepreciationRuns(user.tenantId, pagination);
  }

  @Post('depreciation-runs')
  @RequirePermission('finance:fixed-assets:manage')
  runDepreciation(@CurrentUser() user: any, @Body() dto: RunDepreciationDto) {
    return this.service.runDepreciation(user.tenantId, dto, user.id);
  }

  @Post('depreciation-runs/:id/post')
  @RequirePermission('finance:fixed-assets:manage')
  postRun(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.postDepreciationRun(user.tenantId, id, user.id);
  }

  @Get('depreciation-runs/:id/lines')
  @RequirePermission('finance:fixed-assets:read')
  getRunLines(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getDepreciationRunLines(user.tenantId, id);
  }
}
