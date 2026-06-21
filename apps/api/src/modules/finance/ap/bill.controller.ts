import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillService } from './bill.service';
import { CreateBillDto } from './dto/bill.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';

@ApiTags('finance-ap')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/ap/bills')
export class BillController {
  constructor(private readonly billService: BillService) {}

  @Get()
  @ApiOperation({ summary: 'List bills' })
  findAll(@CurrentUser() user: any) {
    return this.billService.findAll(user.tenantId);
  }

  @Post()
  @RequirePermission('finance:ap:write')
  @ApiOperation({ summary: 'Create a draft bill' })
  create(@CurrentUser() user: any, @Body() dto: CreateBillDto) {
    return this.billService.create(user.tenantId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bill by id' })
  findOne(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.billService.findById(user.tenantId, id);
  }

  @Post(':id/post')
  @RequirePermission('finance:ap:write')
  @ApiOperation({ summary: 'Post a bill (compute and save tax lines)' })
  postBill(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.billService.postBill(user.tenantId, id);
  }

  @Get(':id/tax-lines')
  @ApiOperation({ summary: 'Get tax lines for a bill' })
  getTaxLines(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.billService.getTaxLines(user.tenantId, id);
  }
}
