import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InfoRecordService } from './info-record.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreateInfoRecordDto, UpdateInfoRecordDto } from './dto/info-record.dto';

@ApiTags('procurement-info-records')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/info-records')
export class InfoRecordController {
  constructor(private readonly service: InfoRecordService) {}

  @Get()
  @RequirePermission('procurement:po:read')
  @ApiOperation({ summary: 'List purchasing info records (filter by vendor/item)' })
  @ApiQuery({ name: 'vendorId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  list(
    @CurrentUser() user: any,
    @Query('vendorId') vendorId?: string,
    @Query('itemId') itemId?: string,
  ) {
    return this.service.findAll(user.tenantId, { vendorId, itemId });
  }

  @Get(':id')
  @RequirePermission('procurement:po:read')
  @ApiOperation({ summary: 'Get a purchasing info record by ID' })
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findOne(user.tenantId, id);
  }

  @Post()
  @RequirePermission('procurement:po:create')
  @ApiOperation({ summary: 'Create a purchasing info record' })
  create(@CurrentUser() user: any, @Body() dto: CreateInfoRecordDto) {
    return this.service.create(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('procurement:po:create')
  @ApiOperation({ summary: 'Update a purchasing info record' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateInfoRecordDto) {
    return this.service.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission('procurement:po:create')
  @ApiOperation({ summary: 'Delete a purchasing info record' })
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.remove(user.tenantId, id);
  }
}
