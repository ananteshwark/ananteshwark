import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OutlineAgreementService } from './outline-agreement.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  CreateOutlineAgreementDto,
  UpdateOutlineAgreementDto,
  RecordReleaseDto,
} from './dto/outline-agreement.dto';
import { OutlineAgreementStatus } from './entities/outline-agreement.entity';

@ApiTags('procurement-outline-agreements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/outline-agreements')
export class OutlineAgreementController {
  constructor(private readonly service: OutlineAgreementService) {}

  @Get()
  @RequirePermission('procurement:po:read')
  @ApiOperation({ summary: 'List outline agreements' })
  @ApiQuery({ name: 'vendorId', required: false })
  @ApiQuery({ name: 'status', required: false })
  list(
    @CurrentUser() user: any,
    @Query('vendorId') vendorId?: string,
    @Query('status') status?: OutlineAgreementStatus,
  ) {
    return this.service.findAll(user.tenantId, { vendorId, status });
  }

  @Get(':id')
  @RequirePermission('procurement:po:read')
  @ApiOperation({ summary: 'Get an outline agreement' })
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findOne(user.tenantId, id);
  }

  @Get(':id/utilization')
  @RequirePermission('procurement:po:read')
  @ApiOperation({ summary: 'Get utilization for an outline agreement' })
  getUtilization(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getUtilization(user.tenantId, id);
  }

  @Post()
  @RequirePermission('procurement:po:create')
  @ApiOperation({ summary: 'Create a draft outline agreement' })
  create(@CurrentUser() user: any, @Body() dto: CreateOutlineAgreementDto) {
    return this.service.create(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('procurement:po:create')
  @ApiOperation({ summary: 'Update an outline agreement' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateOutlineAgreementDto) {
    return this.service.update(user.tenantId, id, dto);
  }

  @Post(':id/activate')
  @RequirePermission('procurement:po:create')
  @ApiOperation({ summary: 'Activate a DRAFT outline agreement' })
  activate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.activate(user.tenantId, id);
  }

  @Post(':id/close')
  @RequirePermission('procurement:po:create')
  @ApiOperation({ summary: 'Close an outline agreement' })
  close(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.close(user.tenantId, id);
  }

  @Post(':id/record-release')
  @RequirePermission('procurement:po:create')
  @ApiOperation({ summary: 'Record a manual release against an outline agreement' })
  recordRelease(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RecordReleaseDto) {
    return this.service.recordRelease(user.tenantId, id, dto);
  }
}
