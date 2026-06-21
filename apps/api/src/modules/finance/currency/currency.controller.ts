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
import { CurrencyService } from './currency.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  CreateCurrencyDto,
  UpdateCurrencyDto,
  CreateExchangeRateDto,
  RevaluationDto,
} from './dto/currency.dto';

@ApiTags('finance-currency')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/currencies')
export class CurrencyController {
  constructor(private readonly service: CurrencyService) {}

  // ─── Currencies ──────────────────────────────────────────────
  @Get()
  @RequirePermission('finance:currency:read')
  @ApiOperation({ summary: 'List currencies (seeds defaults on first call)' })
  @ApiQuery({ name: 'includeInactive', required: false })
  list(@CurrentUser() user: any, @Query('includeInactive') includeInactive?: string) {
    return this.service.listCurrencies(user.tenantId, includeInactive === 'true');
  }

  @Post()
  @RequirePermission('finance:currency:manage')
  @ApiOperation({ summary: 'Add a new currency' })
  create(@CurrentUser() user: any, @Body() dto: CreateCurrencyDto) {
    return this.service.createCurrency(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('finance:currency:manage')
  @ApiOperation({ summary: 'Update a currency' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateCurrencyDto) {
    return this.service.updateCurrency(user.tenantId, id, dto);
  }

  // ─── Exchange Rates ──────────────────────────────────────────
  @Get('rates')
  @RequirePermission('finance:currency:read')
  @ApiOperation({ summary: 'List monthly exchange rates' })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'month', required: false })
  listRates(
    @CurrentUser() user: any,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.service.listRates(user.tenantId, {
      year: year ? parseInt(year, 10) : undefined,
      month: month ? parseInt(month, 10) : undefined,
    });
  }

  @Post('rates')
  @RequirePermission('finance:currency:manage')
  @ApiOperation({ summary: 'Add or update a monthly conversion rate' })
  upsertRate(@CurrentUser() user: any, @Body() dto: CreateExchangeRateDto) {
    return this.service.upsertRate(user.tenantId, dto);
  }

  @Delete('rates/:id')
  @RequirePermission('finance:currency:manage')
  @ApiOperation({ summary: 'Delete a monthly conversion rate' })
  deleteRate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteRate(user.tenantId, id);
  }

  // ─── FX Revaluation ─────────────────────────────────────────
  @Post('revalue')
  @RequirePermission('finance:currency:manage')
  @ApiOperation({ summary: 'Run FX revaluation for a given month — posts gain/loss JEs and updates totalBase on open AP/AR documents' })
  revalue(@CurrentUser() user: any, @Body() dto: RevaluationDto) {
    return this.service.runRevaluation(user.tenantId, dto.year, dto.month, user.id);
  }
}
