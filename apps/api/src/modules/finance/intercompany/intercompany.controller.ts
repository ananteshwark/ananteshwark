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
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { IntercompanyService } from './intercompany.service';
import {
  CreateIcRelationshipDto,
  UpdateIcRelationshipDto,
  CreateIcTransactionDto,
} from './dto/intercompany.dto';

@ApiTags('finance-intercompany')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/intercompany')
export class IntercompanyController {
  constructor(private readonly service: IntercompanyService) {}

  // ─── Relationships ───────────────────────────────────────────────────────────

  @Get('relationships')
  @RequirePermission('finance:gl:read')
  @ApiOperation({ summary: 'List intercompany relationships' })
  listRelationships(@CurrentUser() user: any) {
    return this.service.listRelationships(user.tenantId);
  }

  @Post('relationships')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Create an intercompany relationship' })
  createRelationship(
    @CurrentUser() user: any,
    @Body() dto: CreateIcRelationshipDto,
  ) {
    return this.service.createRelationship(user.tenantId, dto);
  }

  @Patch('relationships/:id')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Update an intercompany relationship' })
  updateRelationship(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIcRelationshipDto,
  ) {
    return this.service.updateRelationship(user.tenantId, id, dto);
  }

  // ─── Transactions ────────────────────────────────────────────────────────────

  @Get('transactions')
  @RequirePermission('finance:gl:read')
  @ApiOperation({ summary: 'List intercompany transactions' })
  listTransactions(
    @CurrentUser() user: any,
    @Query('entityId') entityId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listTransactions(user.tenantId, { entityId, status });
  }

  @Get('transactions/:id')
  @RequirePermission('finance:gl:read')
  @ApiOperation({ summary: 'Get one intercompany transaction' })
  getTransaction(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getTransaction(user.tenantId, id);
  }

  @Post('transactions')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Create an intercompany transaction' })
  createTransaction(
    @CurrentUser() user: any,
    @Body() dto: CreateIcTransactionDto,
  ) {
    return this.service.createTransaction(user.tenantId, dto);
  }

  @Post('transactions/:id/post')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Post an intercompany transaction (book AR/AP pair)' })
  postTransaction(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.postTransaction(user.tenantId, id);
  }

  @Post('transactions/:id/eliminate')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Eliminate an intercompany transaction for consolidation' })
  eliminateTransaction(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.eliminateTransaction(user.tenantId, id);
  }

  // ─── Reconciliation ──────────────────────────────────────────────────────────

  @Get('reconciliation')
  @RequirePermission('finance:gl:read')
  @ApiOperation({ summary: 'Intercompany reconciliation (IC AR vs IC AP per pair)' })
  getReconciliation(@CurrentUser() user: any) {
    return this.service.getReconciliation(user.tenantId);
  }
}
