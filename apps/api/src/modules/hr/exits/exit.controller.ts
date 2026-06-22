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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ExitService } from './exit.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ExitReason, ExitStatus } from './entities/exit-request.entity';
import { ChecklistItemStatus } from './entities/exit-checklist-item.entity';

@ApiTags('hr-exits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/exits')
export class ExitController {
  constructor(private readonly service: ExitService) {}

  @Get()
  @RequirePermission('hr:employees:read')
  list(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.service.list(user.tenantId, status);
  }

  @Get(':id')
  @RequirePermission('hr:employees:read')
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getOne(user.tenantId, id);
  }

  @Post()
  @RequirePermission('hr:employees:manage')
  create(
    @CurrentUser() user: any,
    @Body()
    dto: {
      employeeId: string;
      lastWorkingDate: string;
      reason?: ExitReason;
      exitInterviewDate?: string | null;
      notes?: string | null;
      rehireEligible?: boolean | null;
    },
  ) {
    return this.service.create(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('hr:employees:manage')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body()
    dto: Partial<{
      lastWorkingDate: string;
      reason: ExitReason;
      exitInterviewDate: string | null;
      notes: string | null;
      rehireEligible: boolean | null;
      status: ExitStatus;
    }>,
  ) {
    return this.service.update(user.tenantId, id, dto);
  }

  @Get(':id/checklist')
  @RequirePermission('hr:employees:read')
  getChecklist(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getChecklist(user.tenantId, id);
  }

  @Post(':id/checklist')
  @RequirePermission('hr:employees:manage')
  addChecklistItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { item: string; assignedDept?: string | null },
  ) {
    return this.service.addChecklistItem(user.tenantId, id, dto);
  }

  @Patch('checklist/:itemId')
  @RequirePermission('hr:employees:manage')
  updateChecklistItem(
    @CurrentUser() user: any,
    @Param('itemId') itemId: string,
    @Body() dto: { status: ChecklistItemStatus },
  ) {
    return this.service.updateChecklistItem(user.tenantId, itemId, dto);
  }

  @Post(':id/fnf')
  @RequirePermission('hr:employees:manage')
  computeFnf(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body()
    dto: {
      pendingSalary?: number;
      leaveEncashment?: number;
      gratuity?: number;
      deductions?: number;
    },
  ) {
    return this.service.computeFnf(user.tenantId, id, dto);
  }

  @Post(':id/fnf/approve')
  @RequirePermission('hr:employees:manage')
  approveFnf(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approveFnf(user.tenantId, id);
  }

  @Post(':id/fnf/pay')
  @RequirePermission('hr:employees:manage')
  markFnfPaid(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.markFnfPaid(user.tenantId, id);
  }
}
