import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentRunService } from './payment-run.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('finance-payment-runs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/payment-runs')
export class PaymentRunController {
  constructor(private readonly paymentRunService: PaymentRunService) {}

  @Post()
  @RequirePermission('finance:ap:create')
  @ApiOperation({ summary: 'Create a payment run proposal' })
  createProposal(
    @CurrentUser() user: any,
    @Body() body: { dueByDate: string; paymentMethod: string; bankAccountId?: string },
  ) {
    return this.paymentRunService.createProposal(user.tenantId, body);
  }

  @Get()
  @RequirePermission('finance:ap:read')
  @ApiOperation({ summary: 'List payment runs' })
  listRuns(@CurrentUser() user: any) {
    return this.paymentRunService.listRuns(user.tenantId);
  }

  @Get(':id')
  @RequirePermission('finance:ap:read')
  @ApiOperation({ summary: 'Get a payment run proposal (header + items)' })
  getProposal(@CurrentUser() user: any, @Param('id') id: string) {
    return this.paymentRunService.getProposal(user.tenantId, id);
  }

  @Patch('items/:itemId')
  @RequirePermission('finance:ap:create')
  @ApiOperation({ summary: 'Include/exclude a payment run item' })
  toggleItem(
    @CurrentUser() user: any,
    @Param('itemId') itemId: string,
    @Body() body: { included: boolean },
  ) {
    return this.paymentRunService.toggleItem(user.tenantId, itemId, body.included);
  }

  @Post(':id/approve')
  @RequirePermission('finance:ap:create')
  @ApiOperation({ summary: 'Approve a payment run' })
  approveRun(@CurrentUser() user: any, @Param('id') id: string) {
    return this.paymentRunService.approveRun(user.tenantId, id);
  }

  @Post(':id/post')
  @RequirePermission('finance:ap:post')
  @ApiOperation({ summary: 'Post a payment run (records vendor payments)' })
  postRun(@CurrentUser() user: any, @Param('id') id: string) {
    return this.paymentRunService.postRun(user.tenantId, id, user.id);
  }

  @Get(':id/bank-file')
  @RequirePermission('finance:ap:read')
  @ApiOperation({ summary: 'Download a CSV bank file for a payment run' })
  async bankFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const csv = await this.paymentRunService.generateBankFile(user.tenantId, id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="payment-run-${id}.csv"`,
    );
    res.send(csv);
  }
}
