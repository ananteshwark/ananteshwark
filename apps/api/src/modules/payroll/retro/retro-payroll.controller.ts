import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RetroPayrollService } from './retro-payroll.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('payroll-retro')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('payroll')
export class RetroPayrollController {
  constructor(private readonly service: RetroPayrollService) {}

  @Get('retro/arrears')
  @RequirePermission('payroll:runs:read')
  detectArrears(
    @CurrentUser() user: any,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.service.detectArrears(
      user.tenantId,
      Number(month),
      Number(year),
    );
  }

  @Get('retro/records')
  @RequirePermission('payroll:runs:read')
  listRecords(@CurrentUser() user: any, @Query('runId') runId?: string) {
    return this.service.listArrearsRecords(user.tenantId, runId);
  }

  @Post('runs/:id/apply-arrears')
  @RequirePermission('payroll:runs:process')
  applyArrears(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.applyArrearsToRun(user.tenantId, id);
  }
}
