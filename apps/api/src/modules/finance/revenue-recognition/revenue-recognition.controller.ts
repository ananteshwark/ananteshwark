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
import { RevenueRecognitionService } from './revenue-recognition.service';
import {
  CreateRevenueContractDto,
  FulfillObligationDto,
  RecognizeDueDto,
} from './dto/revenue-recognition.dto';

@ApiTags('finance-revenue-recognition')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/revenue-recognition')
export class RevenueRecognitionController {
  constructor(private readonly service: RevenueRecognitionService) {}

  // ─── Contracts ─────────────────────────────────────────────────────────────────

  @Get('contracts')
  @RequirePermission('finance:revenue:read')
  @ApiOperation({ summary: 'List revenue contracts' })
  listContracts(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.service.listContracts(user.tenantId, { status, customerId });
  }

  @Get('contracts/:id')
  @RequirePermission('finance:revenue:read')
  @ApiOperation({ summary: 'Get a revenue contract with obligations, schedules and totals' })
  getContract(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getContractSummary(user.tenantId, id);
  }

  @Post('contracts')
  @RequirePermission('finance:revenue:write')
  @ApiOperation({ summary: 'Create a revenue contract and allocate the transaction price' })
  createContract(@CurrentUser() user: any, @Body() dto: CreateRevenueContractDto) {
    return this.service.createContract(user.tenantId, dto);
  }

  // ─── Obligations ─────────────────────────────────────────────────────────────────

  @Post('obligations/:id/fulfill')
  @RequirePermission('finance:revenue:write')
  @ApiOperation({ summary: 'Fulfil a POINT_IN_TIME obligation (creates its recognition schedule)' })
  fulfillObligation(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FulfillObligationDto,
  ) {
    return this.service.fulfillObligation(user.tenantId, id, dto.fulfilledDate);
  }

  // ─── Recognition ──────────────────────────────────────────────────────────────────

  @Post('recognize')
  @RequirePermission('finance:revenue:write')
  @ApiOperation({ summary: 'Recognise all due schedule rows up to the period end (posts JE)' })
  recognize(@CurrentUser() user: any, @Body() dto: RecognizeDueDto) {
    return this.service.recognizeDue(user.tenantId, dto, user.id);
  }

  // ─── Reporting ──────────────────────────────────────────────────────────────────

  @Get('waterfall')
  @RequirePermission('finance:revenue:read')
  @ApiOperation({ summary: 'Deferred-revenue waterfall (unrecognised amounts by period)' })
  waterfall(@CurrentUser() user: any) {
    return this.service.getDeferredWaterfall(user.tenantId);
  }
}
