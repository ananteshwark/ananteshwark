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
import { RfqService } from './rfq.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateRfqDto, RecordQuoteDto, AwardRfqDto } from './dto/rfq.dto';

@ApiTags('procurement-rfq')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/rfqs')
export class RfqController {
  constructor(private readonly service: RfqService) {}

  @Get()
  @RequirePermission('procurement:rfq:read')
  @ApiOperation({ summary: 'List RFQs' })
  list(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.findAll(user.tenantId, pagination);
  }

  @Get(':id')
  @RequirePermission('procurement:rfq:read')
  @ApiOperation({ summary: 'Get RFQ by ID' })
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findOne(user.tenantId, id);
  }

  @Post()
  @RequirePermission('procurement:rfq:manage')
  @ApiOperation({ summary: 'Create an RFQ' })
  create(@CurrentUser() user: any, @Body() dto: CreateRfqDto) {
    return this.service.createRfq(user.tenantId, dto);
  }

  @Post(':id/issue')
  @RequirePermission('procurement:rfq:manage')
  @ApiOperation({ summary: 'Issue an RFQ to vendors' })
  issue(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.issueRfq(user.tenantId, id);
  }

  @Post(':id/quotes')
  @RequirePermission('procurement:rfq:manage')
  @ApiOperation({ summary: 'Record a vendor quote for an RFQ line' })
  recordQuote(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RecordQuoteDto) {
    return this.service.recordQuote(user.tenantId, id, dto);
  }

  @Get(':id/comparative')
  @RequirePermission('procurement:rfq:read')
  @ApiOperation({ summary: 'Get comparative statement (vendor price matrix)' })
  comparative(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.comparativeStatement(user.tenantId, id);
  }

  @Post(':id/award')
  @RequirePermission('procurement:rfq:manage')
  @ApiOperation({ summary: 'Award an RFQ to a vendor' })
  award(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AwardRfqDto) {
    return this.service.awardRfq(user.tenantId, id, dto);
  }

  @Post(':id/close')
  @RequirePermission('procurement:rfq:manage')
  @ApiOperation({ summary: 'Close an RFQ' })
  close(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.closeRfq(user.tenantId, id);
  }

  @Post(':id/cancel')
  @RequirePermission('procurement:rfq:manage')
  @ApiOperation({ summary: 'Cancel an RFQ' })
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancelRfq(user.tenantId, id);
  }
}
