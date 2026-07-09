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
import { ExpensesService } from './expenses.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ExpenseClaimStatus } from './entities/expense-claim.entity';

@ApiTags('expenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  // ─── Categories ───────────────────────────────────────────────

  @Get('categories')
  @RequirePermission('expenses:claims:read')
  @ApiOperation({ summary: 'List expense categories' })
  listCategories(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.findCategories(user.tenantId, pagination);
  }

  @Post('categories')
  @RequirePermission('expenses:claims:create')
  @ApiOperation({ summary: 'Create expense category' })
  createCategory(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createCategory(user.tenantId, dto);
  }

  @Patch('categories/:id')
  @RequirePermission('expenses:claims:create')
  @ApiOperation({ summary: 'Update expense category' })
  updateCategory(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateCategory(user.tenantId, id, dto);
  }

  // ─── Claims ───────────────────────────────────────────────────

  @Get('claims')
  @RequirePermission('expenses:claims:read')
  @ApiOperation({ summary: 'List expense claims' })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ExpenseClaimStatus })
  listClaims(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: ExpenseClaimStatus,
  ) {
    return this.service.findClaims(user.tenantId, pagination, { employeeId, status });
  }

  @Get('claims/:id')
  @RequirePermission('expenses:claims:read')
  @ApiOperation({ summary: 'Get expense claim by ID' })
  getClaim(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findClaim(user.tenantId, id);
  }

  @Post('claims')
  @RequirePermission('expenses:claims:create')
  @ApiOperation({ summary: 'Create expense claim' })
  createClaim(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createClaim(user.tenantId, user.id, dto);
  }

  @Post('claims/:id/submit')
  @RequirePermission('expenses:claims:create')
  @ApiOperation({ summary: 'Submit expense claim' })
  submitClaim(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.submitClaim(user.tenantId, id);
  }

  @Post('claims/:id/approve')
  @RequirePermission('expenses:claims:approve')
  @ApiOperation({ summary: 'Approve expense claim' })
  approveClaim(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approveClaim(user.tenantId, id, user.id);
  }

  @Post('claims/:id/reject')
  @RequirePermission('expenses:claims:approve')
  @ApiOperation({ summary: 'Reject expense claim' })
  rejectClaim(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.service.rejectClaim(user.tenantId, id, user.id, body.reason);
  }

  @Post('claims/:id/pay')
  @RequirePermission('expenses:claims:approve')
  @ApiOperation({ summary: 'Mark expense claim as paid' })
  markPaid(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.markPaid(user.tenantId, id, user.id);
  }

  @Post('claims/:id/split')
  @RequirePermission('expenses:claims:create')
  @ApiOperation({ summary: 'Split a DRAFT claim with colleagues (shares in percent)' })
  splitClaim(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { splits: Array<{ employeeId: string; sharePct: number }> }) {
    return this.service.splitClaim(user.tenantId, id, body?.splits ?? []);
  }

  @Post('claims/:id/advance-offset')
  @RequirePermission('expenses:claims:approve')
  @ApiOperation({ summary: 'Deduct a paid advance from an approved claim before payout' })
  applyAdvanceOffset(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { advanceId: string; amount: number }) {
    return this.service.applyAdvanceOffset(user.tenantId, id, body);
  }

  // ─── Rate cards ───────────────────────────────────────────────

  @Get('rates')
  @RequirePermission('expenses:claims:read')
  @ApiOperation({ summary: 'List per-diem / mileage rate cards' })
  listRates(@CurrentUser() user: any, @Query('rateType') rateType?: string) {
    return this.service.listRates(user.tenantId, rateType as any);
  }

  @Post('rates')
  @RequirePermission('expenses:claims:approve')
  @ApiOperation({ summary: 'Create a per-diem / mileage rate card' })
  createRate(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createRate(user.tenantId, dto);
  }

  // ─── Budgets ──────────────────────────────────────────────────

  @Get('budgets/status')
  @RequirePermission('expenses:claims:read')
  @ApiOperation({ summary: 'Budget consumption for a year with threshold alerts' })
  budgetStatus(@CurrentUser() user: any, @Query('year') year?: string) {
    return this.service.budgetStatus(user.tenantId, year ? parseInt(year) : new Date().getFullYear());
  }

  @Post('budgets')
  @RequirePermission('expenses:claims:approve')
  @ApiOperation({ summary: 'Create a category spend budget' })
  createBudget(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createBudget(user.tenantId, dto);
  }

  // ─── Policies ─────────────────────────────────────────────────

  @Get('policies')
  @RequirePermission('expenses:claims:read')
  @ApiOperation({ summary: 'List expense policies' })
  listPolicies(@CurrentUser() user: any) {
    return this.service.findPolicies(user.tenantId);
  }

  @Post('policies')
  @RequirePermission('expenses:claims:approve')
  @ApiOperation({ summary: 'Create expense policy' })
  createPolicy(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createPolicy(user.tenantId, dto);
  }

  @Patch('policies/:id')
  @RequirePermission('expenses:claims:approve')
  @ApiOperation({ summary: 'Update expense policy' })
  updatePolicy(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updatePolicy(user.tenantId, id, dto);
  }
}
