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
import { TransferPricingService } from './transfer-pricing.service';
import { IcBillingService } from './ic-billing.service';
import {
  CreateIcRelationshipDto,
  UpdateIcRelationshipDto,
  CreateIcTransactionDto,
  CreateTransferPriceDto,
  UpdateTransferPriceDto,
  ResolveTransferPriceDto,
  GenerateMirrorBillDto,
  GenerateEliminationDto,
} from './dto/intercompany.dto';

@ApiTags('finance-intercompany')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/intercompany')
export class IntercompanyController {
  constructor(
    private readonly service: IntercompanyService,
    private readonly transferPricing: TransferPricingService,
    private readonly icBilling: IcBillingService,
  ) {}

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

  // ─── Transfer Pricing (Phase 86) ─────────────────────────────────────────────

  @Get('transfer-prices')
  @RequirePermission('finance:gl:read')
  @ApiOperation({ summary: 'List transfer-pricing rules' })
  listTransferPrices(
    @CurrentUser() user: any,
    @Query('sellingEntityId') sellingEntityId?: string,
    @Query('buyingEntityId') buyingEntityId?: string,
    @Query('itemCode') itemCode?: string,
  ) {
    return this.transferPricing.list(user.tenantId, { sellingEntityId, buyingEntityId, itemCode });
  }

  @Post('transfer-prices')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Create a transfer-pricing rule' })
  createTransferPrice(@CurrentUser() user: any, @Body() dto: CreateTransferPriceDto) {
    return this.transferPricing.create(user.tenantId, dto);
  }

  @Patch('transfer-prices/:id')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Update a transfer-pricing rule' })
  updateTransferPrice(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransferPriceDto,
  ) {
    return this.transferPricing.update(user.tenantId, id, dto);
  }

  @Post('transfer-prices/resolve')
  @RequirePermission('finance:gl:read')
  @ApiOperation({ summary: 'Resolve the applicable transfer price for a pair/item/date' })
  resolveTransferPrice(@CurrentUser() user: any, @Body() dto: ResolveTransferPriceDto) {
    return this.transferPricing.resolve(user.tenantId, dto);
  }

  // ─── Automatic IC Billing + Elimination (Phase 86) ────────────────────────────

  @Post('mirror-bill')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Generate the mirror AP bill in the buying entity for an IC AR invoice' })
  generateMirrorBill(@CurrentUser() user: any, @Body() dto: GenerateMirrorBillDto) {
    return this.icBilling.generateMirrorBill(user.tenantId, dto.arInvoiceId, dto.relationshipId, user.id);
  }

  @Post('eliminations')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Generate IC elimination journal entries for posted transactions' })
  generateEliminations(@CurrentUser() user: any, @Body() dto: GenerateEliminationDto) {
    return this.icBilling.generateEliminationEntries(
      user.tenantId,
      { periodEnd: dto.periodEnd, groupId: dto.groupId },
      user.id,
    );
  }
}
