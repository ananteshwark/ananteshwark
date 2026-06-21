import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseFloatPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TaxService } from './tax.service';
import { CreateTaxCodeDto, UpdateTaxCodeDto } from './dto/tax.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';

@ApiTags('finance-tax')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/tax')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Get('codes')
  @ApiOperation({ summary: 'List active tax codes' })
  listCodes(@CurrentUser() user: any) {
    return this.taxService.listTaxCodes(user.tenantId);
  }

  @Post('codes')
  @RequirePermission('finance:ap:write', 'finance:ar:write')
  @ApiOperation({ summary: 'Create a tax code' })
  createCode(@CurrentUser() user: any, @Body() dto: CreateTaxCodeDto) {
    return this.taxService.createTaxCode(user.tenantId, dto);
  }

  @Patch('codes/:id')
  @RequirePermission('finance:ap:write', 'finance:ar:write')
  @ApiOperation({ summary: 'Update a tax code' })
  updateCode(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxCodeDto,
  ) {
    return this.taxService.updateTaxCode(user.tenantId, id, dto);
  }

  @Delete('codes/:id')
  @RequirePermission('finance:ap:write', 'finance:ar:write')
  @ApiOperation({ summary: 'Soft-delete a tax code (set isActive=false)' })
  deleteCode(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.taxService.updateTaxCode(user.tenantId, id, { isActive: false });
  }

  @Get('codes/:id/calculate')
  @ApiOperation({ summary: 'Preview tax calculation for a given base amount' })
  @ApiQuery({ name: 'baseAmount', type: Number, required: true })
  calculatePreview(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('baseAmount', ParseFloatPipe) baseAmount: number,
  ) {
    return this.taxService.calculateTaxById(user.tenantId, id, baseAmount);
  }

  @Get('report')
  @RequirePermission('hr:org:manage')
  @ApiOperation({ summary: 'Tax summary report (admin only)' })
  @ApiQuery({ name: 'fromDate', required: true })
  @ApiQuery({ name: 'toDate', required: true })
  taxReport(
    @CurrentUser() user: any,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    return this.taxService.taxSummaryReport(
      user.tenantId,
      new Date(fromDate),
      new Date(toDate),
    );
  }
}
