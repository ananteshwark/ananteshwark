import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { I9Service } from './i9.service';
import { I9Status, CitizenshipStatus, EVerifyResult } from './entities/i9-case.entity';

@ApiTags('hr-i9')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/i9')
export class I9Controller {
  constructor(private readonly service: I9Service) {}

  @Get('cases')
  @RequirePermission('hr:i9:read')
  listCases(@CurrentUser() user: any, @Query('status') status?: I9Status) {
    return this.service.listCases(user.tenantId, status);
  }

  @Post('cases')
  @RequirePermission('hr:i9:manage')
  @ApiOperation({ summary: 'Open an I-9 case on hire (sets the 3-business-day Section 2 deadline)' })
  createCase(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createCase(user.tenantId, dto);
  }

  @Get('cases/:id')
  @RequirePermission('hr:i9:read')
  getCase(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getCase(user.tenantId, id);
  }

  @Post('cases/:id/section1')
  @RequirePermission('hr:i9:manage')
  @ApiOperation({ summary: 'Employee attestation (Section 1)' })
  completeSection1(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { citizenshipStatus: CitizenshipStatus; workAuthExpiry?: string; signedAt?: string }) {
    return this.service.completeSection1(user.tenantId, id, dto);
  }

  @Post('cases/:id/section2')
  @RequirePermission('hr:i9:manage')
  @ApiOperation({ summary: 'Employer document review (Section 2): List A alone, or List B + List C' })
  completeSection2(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { documents: Array<{ list: 'A' | 'B' | 'C'; title: string; number?: string; expiry?: string }> }) {
    return this.service.completeSection2(user.tenantId, id, { documents: body?.documents ?? [], verifiedByUserId: user.id });
  }

  @Post('cases/:id/everify')
  @RequirePermission('hr:i9:manage')
  recordEVerify(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { caseNumber: string; result: EVerifyResult }) {
    return this.service.recordEVerify(user.tenantId, id, dto);
  }

  @Post('cases/:id/reverify')
  @RequirePermission('hr:i9:manage')
  flagReverification(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { reverificationDate: string }) {
    return this.service.flagReverification(user.tenantId, id, body.reverificationDate);
  }

  @Get('section2-overdue')
  @RequirePermission('hr:i9:read')
  section2Overdue(@CurrentUser() user: any, @Query('asOf') asOf: string) {
    return this.service.section2Overdue(user.tenantId, asOf);
  }

  @Get('due-for-reverification')
  @RequirePermission('hr:i9:read')
  dueForReverification(@CurrentUser() user: any, @Query('asOf') asOf: string) {
    return this.service.dueForReverification(user.tenantId, asOf);
  }
}
