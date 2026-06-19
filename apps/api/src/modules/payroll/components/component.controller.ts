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
import { ComponentService } from './component.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  CreatePayComponentDto,
  UpdatePayComponentDto,
  CreateSalaryStructureDto,
  UpdateSalaryStructureDto,
  AssignSalaryDto,
} from './dto/component.dto';

@ApiTags('payroll-components')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('payroll')
export class ComponentController {
  constructor(private readonly service: ComponentService) {}

  // Components
  @Get('components')
  @RequirePermission('payroll:components:read')
  listComponents(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('type') type?: string,
  ) {
    return this.service.findComponents(user.tenantId, pagination, { type });
  }

  @Get('components/:id')
  @RequirePermission('payroll:components:read')
  getComponent(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findComponent(user.tenantId, id);
  }

  @Post('components')
  @RequirePermission('payroll:components:manage')
  createComponent(@CurrentUser() user: any, @Body() dto: CreatePayComponentDto) {
    return this.service.createComponent(user.tenantId, dto);
  }

  @Patch('components/:id')
  @RequirePermission('payroll:components:manage')
  updateComponent(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdatePayComponentDto,
  ) {
    return this.service.updateComponent(user.tenantId, id, dto);
  }

  // Structures
  @Get('structures')
  @RequirePermission('payroll:components:read')
  listStructures(@CurrentUser() user: any) {
    return this.service.findStructures(user.tenantId);
  }

  @Get('structures/:id')
  @RequirePermission('payroll:components:read')
  getStructure(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findStructure(user.tenantId, id);
  }

  @Post('structures')
  @RequirePermission('payroll:components:manage')
  createStructure(@CurrentUser() user: any, @Body() dto: CreateSalaryStructureDto) {
    return this.service.createStructure(user.tenantId, dto);
  }

  @Patch('structures/:id')
  @RequirePermission('payroll:components:manage')
  updateStructure(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateSalaryStructureDto,
  ) {
    return this.service.updateStructure(user.tenantId, id, dto);
  }

  // Employee salaries
  @Get('salaries')
  @RequirePermission('payroll:components:read')
  listSalaries(@CurrentUser() user: any) {
    return this.service.listEmployeeSalaries(user.tenantId);
  }

  @Get('salaries/employee/:employeeId')
  @RequirePermission('payroll:components:read')
  getEmployeeSalary(
    @CurrentUser() user: any,
    @Param('employeeId') employeeId: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.service.getEmployeeSalary(user.tenantId, employeeId, asOf);
  }

  @Post('salaries')
  @RequirePermission('payroll:components:manage')
  assignSalary(@CurrentUser() user: any, @Body() dto: AssignSalaryDto) {
    return this.service.assignSalary(user.tenantId, dto);
  }
}
