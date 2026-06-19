import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GrnService } from './grn.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateGrnDto } from './dto/grn.dto';

@ApiTags('procurement-grn')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/grns')
export class GrnController {
  constructor(private readonly service: GrnService) {}

  @Get()
  @RequirePermission('procurement:grn:read')
  @ApiOperation({ summary: 'List GRNs' })
  list(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.findAll(user.tenantId, pagination);
  }

  @Get(':id')
  @RequirePermission('procurement:grn:read')
  @ApiOperation({ summary: 'Get GRN by ID' })
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findOne(user.tenantId, id);
  }

  @Post()
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Create a GRN against a PO' })
  create(@CurrentUser() user: any, @Body() dto: CreateGrnDto) {
    return this.service.createGrn(user.tenantId, dto);
  }

  @Post(':id/confirm')
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Confirm a GRN (triggers 3-way match and AP bill creation)' })
  confirm(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.confirmGrn(user.tenantId, id, user.id);
  }

  @Get(':id/match')
  @RequirePermission('procurement:grn:read')
  @ApiOperation({ summary: 'Get 3-way match result for a GRN' })
  match(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.threeWayMatch(user.tenantId, id);
  }

  @Post(':id/cancel')
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Cancel a DRAFT GRN' })
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancelGrn(user.tenantId, id);
  }
}
