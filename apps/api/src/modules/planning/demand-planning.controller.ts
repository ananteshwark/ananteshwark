import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { DemandPlanningService } from './demand-planning.service';
import {
  GenerateForecastDto,
  AdjustPeriodDto,
  RecordActualDto,
} from './dto/demand-planning.dto';

@ApiTags('planning-demand')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('planning/demand')
export class DemandPlanningController {
  constructor(private readonly service: DemandPlanningService) {}

  @Get('forecasts')
  @RequirePermission('planning:demand:read')
  @ApiOperation({ summary: 'List demand forecasts' })
  list(
    @CurrentUser() user: any,
    @Query('itemId') itemId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listForecasts(user.tenantId, { itemId, status });
  }

  @Get('released')
  @RequirePermission('planning:demand:read')
  @ApiOperation({ summary: 'Released demand (planned independent requirements) for supply planning' })
  released(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getReleasedDemand(user.tenantId, { from, to });
  }

  @Get('history/:itemId')
  @RequirePermission('planning:demand:read')
  @ApiOperation({ summary: 'Monthly sales history for an item' })
  history(
    @CurrentUser() user: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query('months') months?: string,
  ) {
    return this.service.getSalesHistory(user.tenantId, itemId, months ? parseInt(months, 10) : 12);
  }

  @Get('forecasts/:id')
  @RequirePermission('planning:demand:read')
  @ApiOperation({ summary: 'Get a forecast with its periods and accuracy' })
  get(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getForecastDetail(user.tenantId, id);
  }

  @Post('forecasts')
  @RequirePermission('planning:demand:write')
  @ApiOperation({ summary: 'Generate a forecast from sales history' })
  generate(@CurrentUser() user: any, @Body() dto: GenerateForecastDto) {
    return this.service.generateForecast(user.tenantId, dto);
  }

  @Post('forecasts/:id/release')
  @RequirePermission('planning:demand:write')
  @ApiOperation({ summary: 'Release a forecast as planned independent requirements' })
  release(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.releaseForecast(user.tenantId, id);
  }

  @Patch('periods/:id/adjust')
  @RequirePermission('planning:demand:write')
  @ApiOperation({ summary: 'Manually adjust a forecast period quantity' })
  adjust(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustPeriodDto,
  ) {
    return this.service.adjustPeriod(user.tenantId, id, dto);
  }

  @Patch('periods/:id/actual')
  @RequirePermission('planning:demand:write')
  @ApiOperation({ summary: 'Record the realised actual quantity for a period' })
  actual(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordActualDto,
  ) {
    return this.service.recordActual(user.tenantId, id, dto);
  }
}
