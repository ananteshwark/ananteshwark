import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EmployeeService } from './employee.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  CreateEmployeeDto, UpdateEmployeeDto,
  CreateDepartmentDto, UpdateDepartmentDto,
  CreateDesignationDto, UpdateDesignationDto,
  CreateLocationDto, UpdateLocationDto,
} from './dto/employee.dto';

@ApiTags('hr-employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  // Employees
  @Get('employees')
  @RequirePermission('hr:employees:read')
  listEmployees(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: string,
  ) {
    return this.employeeService.findEmployees(user.tenantId, pagination, { search, departmentId, status });
  }

  @Get('employees/:id')
  @RequirePermission('hr:employees:read')
  getEmployee(@CurrentUser() user: any, @Param('id') id: string) {
    return this.employeeService.findEmployee(user.tenantId, id);
  }

  @Get('employees/:id/reportees')
  @RequirePermission('hr:employees:read')
  getReportees(@CurrentUser() user: any, @Param('id') id: string) {
    return this.employeeService.getReportees(user.tenantId, id);
  }

  @Post('employees')
  @RequirePermission('hr:employees:create')
  createEmployee(@CurrentUser() user: any, @Body() dto: CreateEmployeeDto) {
    return this.employeeService.createEmployee(user.tenantId, dto);
  }

  @Patch('employees/:id')
  @RequirePermission('hr:employees:update')
  updateEmployee(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeeService.updateEmployee(user.tenantId, id, dto);
  }

  @Post('employees/:id/terminate')
  @RequirePermission('hr:employees:update')
  terminateEmployee(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { dateOfLeaving: string }) {
    return this.employeeService.terminateEmployee(user.tenantId, id, body.dateOfLeaving);
  }

  @Post('employees/:id/resign')
  @RequirePermission('hr:employees:update')
  resignEmployee(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { dateOfLeaving: string }) {
    return this.employeeService.resignEmployee(user.tenantId, id, body.dateOfLeaving);
  }

  // Departments
  @Get('departments')
  @RequirePermission('hr:employees:read')
  listDepartments(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.employeeService.findDepartments(user.tenantId, pagination);
  }

  @Get('departments/tree')
  @RequirePermission('hr:employees:read')
  getDepartmentTree(@CurrentUser() user: any) {
    return this.employeeService.getOrgTree(user.tenantId);
  }

  @Get('departments/:id')
  @RequirePermission('hr:employees:read')
  getDepartment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.employeeService.findDepartment(user.tenantId, id);
  }

  @Post('departments')
  @RequirePermission('hr:org:manage')
  createDepartment(@CurrentUser() user: any, @Body() dto: CreateDepartmentDto) {
    return this.employeeService.createDepartment(user.tenantId, dto);
  }

  @Patch('departments/:id')
  @RequirePermission('hr:org:manage')
  updateDepartment(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.employeeService.updateDepartment(user.tenantId, id, dto);
  }

  // Designations
  @Get('designations')
  @RequirePermission('hr:employees:read')
  listDesignations(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.employeeService.findDesignations(user.tenantId, pagination);
  }

  @Get('designations/:id')
  @RequirePermission('hr:employees:read')
  getDesignation(@CurrentUser() user: any, @Param('id') id: string) {
    return this.employeeService.findDesignation(user.tenantId, id);
  }

  @Post('designations')
  @RequirePermission('hr:org:manage')
  createDesignation(@CurrentUser() user: any, @Body() dto: CreateDesignationDto) {
    return this.employeeService.createDesignation(user.tenantId, dto);
  }

  @Patch('designations/:id')
  @RequirePermission('hr:org:manage')
  updateDesignation(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateDesignationDto) {
    return this.employeeService.updateDesignation(user.tenantId, id, dto);
  }

  // Locations
  @Get('locations')
  @RequirePermission('hr:employees:read')
  listLocations(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.employeeService.findLocations(user.tenantId, pagination);
  }

  @Get('locations/:id')
  @RequirePermission('hr:employees:read')
  getLocation(@CurrentUser() user: any, @Param('id') id: string) {
    return this.employeeService.findLocation(user.tenantId, id);
  }

  @Post('locations')
  @RequirePermission('hr:org:manage')
  createLocation(@CurrentUser() user: any, @Body() dto: CreateLocationDto) {
    return this.employeeService.createLocation(user.tenantId, dto);
  }

  @Patch('locations/:id')
  @RequirePermission('hr:org:manage')
  updateLocation(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.employeeService.updateLocation(user.tenantId, id, dto);
  }
}
