import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AiExpenseService, ExpenseLineInput, RiskPolicy } from './ai-expense.service';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

@ApiTags('ai-expense')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('ai/expense')
export class AiExpenseController {
  constructor(private readonly service: AiExpenseService) {}

  @Get('ocr/usage')
  @RequirePermission('ai:expense:ocr')
  ocrUsage(@CurrentUser() user: any, @Query('month') month?: string) {
    return this.service.ocrUsage(user.tenantId, month ?? currentMonth());
  }

  @Post('ocr/extract')
  @RequirePermission('ai:expense:ocr')
  @ApiOperation({ summary: 'Extract structured fields from a receipt (metered; requires OCR key)' })
  extract(@CurrentUser() user: any, @Body() body: { text?: string; imageBase64?: string; mediaType?: string; month?: string }) {
    return this.service.extractReceipt(user.tenantId, body?.month ?? currentMonth(), body ?? {});
  }

  @Post('risk/score-claim')
  @RequirePermission('ai:expense:read')
  @ApiOperation({ summary: 'Score expense claim lines for policy/fraud risk (deterministic)' })
  scoreClaim(@CurrentUser() _user: any, @Body() body: { lines: ExpenseLineInput[]; policy?: RiskPolicy }) {
    return this.service.scoreClaim(body?.lines ?? [], body?.policy ?? {});
  }
}
