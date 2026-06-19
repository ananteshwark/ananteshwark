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
import { BankService } from './bank.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
  CreateTransactionDto,
  ReconcileDto,
} from './dto/bank.dto';

@ApiTags('finance-bank')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/bank')
export class BankController {
  constructor(private readonly bankService: BankService) {}

  // -------------------- Bank Accounts --------------------

  @Get('accounts')
  @RequirePermission('finance:bank:read')
  @ApiOperation({ summary: 'List bank accounts (paginated)' })
  findBankAccounts(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.bankService.findBankAccounts(user.tenantId, pagination);
  }

  @Get('accounts/:id')
  @RequirePermission('finance:bank:read')
  @ApiOperation({ summary: 'Get bank account by ID' })
  findBankAccount(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bankService.findBankAccount(user.tenantId, id);
  }

  @Post('accounts')
  @RequirePermission('finance:bank:create')
  @ApiOperation({ summary: 'Create a bank account' })
  createBankAccount(@CurrentUser() user: any, @Body() dto: CreateBankAccountDto) {
    return this.bankService.createBankAccount(user.tenantId, dto);
  }

  @Patch('accounts/:id')
  @RequirePermission('finance:bank:create')
  @ApiOperation({ summary: 'Update a bank account' })
  updateBankAccount(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.bankService.updateBankAccount(user.tenantId, id, dto);
  }

  // -------------------- Transactions --------------------

  @Get('transactions')
  @RequirePermission('finance:bank:read')
  @ApiOperation({ summary: 'List bank transactions (paginated)' })
  @ApiQuery({ name: 'bankAccountId', required: false })
  findTransactions(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('bankAccountId') bankAccountId?: string,
  ) {
    return this.bankService.findTransactions(user.tenantId, pagination, bankAccountId);
  }

  @Post('transactions')
  @RequirePermission('finance:bank:create')
  @ApiOperation({ summary: 'Record a bank transaction (creates a GL journal entry)' })
  createTransaction(@CurrentUser() user: any, @Body() dto: CreateTransactionDto) {
    return this.bankService.createTransaction(user.tenantId, dto, user.id);
  }

  // -------------------- Reconciliation --------------------

  @Get('reconciliations')
  @RequirePermission('finance:bank:read')
  @ApiOperation({ summary: 'List reconciliations for a bank account' })
  @ApiQuery({ name: 'bankAccountId', required: true })
  findReconciliations(
    @CurrentUser() user: any,
    @Query('bankAccountId') bankAccountId: string,
  ) {
    return this.bankService.findReconciliations(user.tenantId, bankAccountId);
  }

  @Post('reconcile')
  @RequirePermission('finance:bank:reconcile')
  @ApiOperation({ summary: 'Reconcile a bank account against a bank statement' })
  reconcile(@CurrentUser() user: any, @Body() dto: ReconcileDto) {
    return this.bankService.reconcile(user.tenantId, dto, user.id);
  }
}
