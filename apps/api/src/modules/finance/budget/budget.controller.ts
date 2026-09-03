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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { BudgetService } from './budget.service';
import {
  CreateBudgetLineDto,
  UpdateBudgetLineDto,
  CheckBudgetDto,
} from './dto/budget.dto';

@ApiTags('finance-budget')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('finance/budget')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get('vs-actual')
  @ApiOperation({ summary: 'Budget vs Actual with commitment accounting' })
  vsActual(
    @CurrentUser() user: any,
    @Query('fiscalYear') fiscalYear: string,
    @Query('period') period?: string,
    @Query('costCenterId') costCenterId?: string,
  ) {
    return this.budgetService.getBudgetVsActual(user.tenantId, {
      fiscalYear: parseInt(fiscalYear, 10) || new Date().getFullYear(),
      period: period || null,
      costCenterId: costCenterId || null,
    });
  }

  @Post('check')
  @ApiOperation({ summary: 'Advisory budget availability check' })
  check(@CurrentUser() user: any, @Body() dto: CheckBudgetDto) {
    return this.budgetService.checkBudget(user.tenantId, dto);
  }

  @Get('lines')
  @ApiOperation({ summary: 'List budget lines' })
  listLines(@CurrentUser() user: any, @Query('fiscalYear') fiscalYear?: string) {
    return this.budgetService.listLines(
      user.tenantId,
      fiscalYear ? parseInt(fiscalYear, 10) : undefined,
    );
  }

  @Post('lines')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Create budget line' })
  createLine(@CurrentUser() user: any, @Body() dto: CreateBudgetLineDto) {
    return this.budgetService.createLine(user.tenantId, dto);
  }

  @Patch('lines/:id')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Update budget line' })
  updateLine(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBudgetLineDto,
  ) {
    return this.budgetService.updateLine(user.tenantId, id, dto);
  }

  @Delete('lines/:id')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Delete budget line' })
  deleteLine(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgetService.deleteLine(user.tenantId, id);
  }
}
