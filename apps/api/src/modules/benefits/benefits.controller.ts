import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BenefitsService } from './benefits.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreateBenefitPlanDto, CreateEnrollmentDto, TerminateEnrollmentDto,
  CreateSalaryBandDto, CreateMeritCycleDto, UpdateCycleStatusDto,
  BulkAllocateDto, ApproveAllocationDto,
} from './dto/benefits.dto';

@ApiTags('benefits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('benefits')
export class BenefitsController {
  constructor(private readonly service: BenefitsService) {}

  // Benefit Plans
  @Get('plans')
  @RequirePermission('benefits:read')
  listPlans(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listPlans(user.tenantId, pagination);
  }

  @Post('plans')
  @RequirePermission('benefits:manage')
  createPlan(@CurrentUser() user: any, @Body() dto: CreateBenefitPlanDto) {
    return this.service.createPlan(user.tenantId, dto);
  }

  // Enrollments
  @Get('enrollments')
  @RequirePermission('benefits:read')
  listEnrollments(@CurrentUser() user: any, @Query('employeeId') employeeId?: string) {
    return this.service.listEnrollments(user.tenantId, employeeId);
  }

  @Post('enrollments')
  @RequirePermission('benefits:manage')
  enroll(@CurrentUser() user: any, @Body() dto: CreateEnrollmentDto) {
    return this.service.enrollEmployee(user.tenantId, dto);
  }

  @Patch('enrollments/:id/terminate')
  @RequirePermission('benefits:manage')
  terminate(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: TerminateEnrollmentDto) {
    return this.service.terminateEnrollment(user.tenantId, id, dto);
  }

  // Salary Bands
  @Get('salary-bands')
  @RequirePermission('compensation:read')
  listBands(@CurrentUser() user: any) {
    return this.service.listBands(user.tenantId);
  }

  @Post('salary-bands')
  @RequirePermission('compensation:manage')
  createBand(@CurrentUser() user: any, @Body() dto: CreateSalaryBandDto) {
    return this.service.createBand(user.tenantId, dto);
  }

  // Merit Cycles
  @Get('merit-cycles')
  @RequirePermission('compensation:read')
  listCycles(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listCycles(user.tenantId, pagination);
  }

  @Post('merit-cycles')
  @RequirePermission('compensation:manage')
  createCycle(@CurrentUser() user: any, @Body() dto: CreateMeritCycleDto) {
    return this.service.createCycle(user.tenantId, dto);
  }

  @Patch('merit-cycles/:id/status')
  @RequirePermission('compensation:manage')
  updateCycleStatus(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateCycleStatusDto) {
    return this.service.updateCycleStatus(user.tenantId, id, dto);
  }

  // Merit Allocations
  @Get('merit-cycles/:cycleId/allocations')
  @RequirePermission('compensation:read')
  listAllocations(@CurrentUser() user: any, @Param('cycleId') cycleId: string) {
    return this.service.listAllocations(user.tenantId, cycleId);
  }

  @Post('merit-cycles/:cycleId/allocations/bulk')
  @RequirePermission('compensation:manage')
  bulkAllocate(@CurrentUser() user: any, @Param('cycleId') cycleId: string, @Body() dto: BulkAllocateDto) {
    return this.service.bulkAllocate(user.tenantId, cycleId, dto);
  }

  @Patch('merit-cycles/:cycleId/allocations/:id/approve')
  @RequirePermission('compensation:manage')
  approveAllocation(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: ApproveAllocationDto) {
    return this.service.approveAllocation(user.tenantId, id, user.id, dto);
  }
}
