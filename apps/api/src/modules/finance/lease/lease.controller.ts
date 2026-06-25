import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { LeaseService } from './lease.service';
import { CreateLeaseDto, PostLeasePeriodDto } from './dto/lease.dto';

@ApiTags('finance-lease')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/leases')
export class LeaseController {
  constructor(private readonly service: LeaseService) {}

  @Get()
  @RequirePermission('finance:lease:read')
  @ApiOperation({ summary: 'List leases' })
  list(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.service.listLeases(user.tenantId, { status });
  }

  @Get('portfolio')
  @RequirePermission('finance:lease:read')
  @ApiOperation({ summary: 'Lease portfolio summary (ROU asset and liability totals)' })
  portfolio(@CurrentUser() user: any) {
    return this.service.getPortfolioSummary(user.tenantId);
  }

  @Get('maturity')
  @RequirePermission('finance:lease:read')
  @ApiOperation({ summary: 'Lease liability maturity analysis by year' })
  maturity(@CurrentUser() user: any) {
    return this.service.getMaturityAnalysis(user.tenantId);
  }

  @Get(':id')
  @RequirePermission('finance:lease:read')
  @ApiOperation({ summary: 'Get a lease with its amortisation schedule' })
  get(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getLeaseDetail(user.tenantId, id);
  }

  @Post()
  @RequirePermission('finance:lease:write')
  @ApiOperation({ summary: 'Create a lease (recognises ROU asset + liability, builds schedule)' })
  create(@CurrentUser() user: any, @Body() dto: CreateLeaseDto) {
    return this.service.createLease(user.tenantId, dto, user.id);
  }

  @Post('post-periods')
  @RequirePermission('finance:lease:write')
  @ApiOperation({ summary: 'Post all due lease schedule periods up to a date' })
  postPeriods(@CurrentUser() user: any, @Body() dto: PostLeasePeriodDto) {
    return this.service.postDuePeriods(user.tenantId, dto, user.id);
  }
}
