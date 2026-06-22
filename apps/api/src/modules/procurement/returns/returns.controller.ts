import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReturnsService } from './returns.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreatePurchaseReturnDto } from './dto/purchase-return.dto';
import { PurchaseReturnStatus } from './entities/purchase-return.entity';

@ApiTags('procurement-returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/returns')
export class ReturnsController {
  constructor(private readonly service: ReturnsService) {}

  @Get()
  @RequirePermission('procurement:grn:read')
  @ApiOperation({ summary: 'List purchase returns (filter by vendor/status)' })
  @ApiQuery({ name: 'vendorId', required: false })
  @ApiQuery({ name: 'status', required: false })
  list(
    @CurrentUser() user: any,
    @Query('vendorId') vendorId?: string,
    @Query('status') status?: PurchaseReturnStatus,
  ) {
    return this.service.findAll(user.tenantId, { vendorId, status });
  }

  @Get(':id')
  @RequirePermission('procurement:grn:read')
  @ApiOperation({ summary: 'Get a purchase return by ID' })
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findOne(user.tenantId, id);
  }

  @Post()
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Create a purchase return (optionally referencing a GRN)' })
  create(@CurrentUser() user: any, @Body() dto: CreatePurchaseReturnDto) {
    return this.service.create(user.tenantId, dto);
  }

  @Post(':id/post')
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Post a return: reverse stock and produce debit note' })
  post(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.postReturn(user.tenantId, id);
  }
}
