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
  BulkCreateEmployeeDto,
  CreateLegalEntityDto, UpdateLegalEntityDto,
  CreateBusinessUnitDto, UpdateBusinessUnitDto,
  CreateDivisionDto, UpdateDivisionDto,
  CreateDepartmentDto, UpdateDepartmentDto,
  CreateFunctionDto, UpdateFunctionDto,
  CreateSubFunctionDto, UpdateSubFunctionDto,
  CreateTeamDto, UpdateTeamDto,
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

  @Post('employees/bulk')
  @RequirePermission('hr:employees:create')
  bulkCreateEmployees(@CurrentUser() user: any, @Body() dto: BulkCreateEmployeeDto) {
    return this.employeeService.bulkCreateEmployees(user.tenantId, dto.rows);
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

  // Legal Entities
  @Get('legal-entities')
  @RequirePermission('hr:employees:read')
  listLegalEntities(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.employeeService.findLegalEntities(user.tenantId, pagination);
  }

  @Post('legal-entities')
  @RequirePermission('hr:org:manage')
  createLegalEntity(@CurrentUser() user: any, @Body() dto: CreateLegalEntityDto) {
    return this.employeeService.createLegalEntity(user.tenantId, dto);
  }

  @Patch('legal-entities/:id')
  @RequirePermission('hr:org:manage')
  updateLegalEntity(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateLegalEntityDto) {
    return this.employeeService.updateLegalEntity(user.tenantId, id, dto);
  }

  // Divisions
  @Get('divisions')
  @RequirePermission('hr:employees:read')
  listDivisions(@CurrentUser() user: any, @Query() pagination: PaginationDto, @Query('businessUnitId') businessUnitId?: string) {
    return this.employeeService.findDivisions(user.tenantId, pagination, businessUnitId);
  }

  @Post('divisions')
  @RequirePermission('hr:org:manage')
  createDivision(@CurrentUser() user: any, @Body() dto: CreateDivisionDto) {
    return this.employeeService.createDivision(user.tenantId, dto);
  }

  @Patch('divisions/:id')
  @RequirePermission('hr:org:manage')
  updateDivision(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateDivisionDto) {
    return this.employeeService.updateDivision(user.tenantId, id, dto);
  }

  // Business Units
  @Get('business-units')
  @RequirePermission('hr:employees:read')
  listBusinessUnits(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.employeeService.findBusinessUnits(user.tenantId, pagination);
  }

  @Post('business-units')
  @RequirePermission('hr:org:manage')
  createBusinessUnit(@CurrentUser() user: any, @Body() dto: CreateBusinessUnitDto) {
    return this.employeeService.createBusinessUnit(user.tenantId, dto);
  }

  @Patch('business-units/:id')
  @RequirePermission('hr:org:manage')
  updateBusinessUnit(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateBusinessUnitDto) {
    return this.employeeService.updateBusinessUnit(user.tenantId, id, dto);
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

  // Functions
  @Get('functions')
  @RequirePermission('hr:employees:read')
  listFunctions(@CurrentUser() user: any, @Query() pagination: PaginationDto, @Query('departmentId') departmentId?: string) {
    return this.employeeService.findFunctions(user.tenantId, pagination, departmentId);
  }

  @Post('functions')
  @RequirePermission('hr:org:manage')
  createFunction(@CurrentUser() user: any, @Body() dto: CreateFunctionDto) {
    return this.employeeService.createFunction(user.tenantId, dto);
  }

  @Patch('functions/:id')
  @RequirePermission('hr:org:manage')
  updateFunction(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateFunctionDto) {
    return this.employeeService.updateFunction(user.tenantId, id, dto);
  }

  // Sub Functions
  @Get('sub-functions')
  @RequirePermission('hr:employees:read')
  listSubFunctions(@CurrentUser() user: any, @Query() pagination: PaginationDto, @Query('functionId') functionId?: string) {
    return this.employeeService.findSubFunctions(user.tenantId, pagination, functionId);
  }

  @Post('sub-functions')
  @RequirePermission('hr:org:manage')
  createSubFunction(@CurrentUser() user: any, @Body() dto: CreateSubFunctionDto) {
    return this.employeeService.createSubFunction(user.tenantId, dto);
  }

  @Patch('sub-functions/:id')
  @RequirePermission('hr:org:manage')
  updateSubFunction(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateSubFunctionDto) {
    return this.employeeService.updateSubFunction(user.tenantId, id, dto);
  }

  // Teams
  @Get('teams')
  @RequirePermission('hr:employees:read')
  listTeams(@CurrentUser() user: any, @Query() pagination: PaginationDto, @Query('subFunctionId') subFunctionId?: string) {
    return this.employeeService.findTeams(user.tenantId, pagination, subFunctionId);
  }

  @Post('teams')
  @RequirePermission('hr:org:manage')
  createTeam(@CurrentUser() user: any, @Body() dto: CreateTeamDto) {
    return this.employeeService.createTeam(user.tenantId, dto);
  }

  @Patch('teams/:id')
  @RequirePermission('hr:org:manage')
  updateTeam(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateTeamDto) {
    return this.employeeService.updateTeam(user.tenantId, id, dto);
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

  // Transfers & Promotions
  @Get('transfers')
  @RequirePermission('hr:employees:read')
  listTransfers(@CurrentUser() user: any, @Query('employeeId') employeeId?: string) {
    return this.employeeService.listTransfers(user.tenantId, employeeId);
  }

  @Post('transfers')
  @RequirePermission('hr:employees:manage')
  createTransfer(@CurrentUser() user: any, @Body() dto: any) {
    return this.employeeService.createTransfer(user.tenantId, dto);
  }

  @Post('transfers/:id/approve')
  @RequirePermission('hr:employees:manage')
  approveTransfer(@CurrentUser() user: any, @Param('id') id: string) {
    return this.employeeService.approveTransfer(user.tenantId, id, user.id);
  }

  @Post('transfers/:id/effectuate')
  @RequirePermission('hr:employees:manage')
  effectuateTransfer(@CurrentUser() user: any, @Param('id') id: string) {
    return this.employeeService.effectuateTransfer(user.tenantId, id);
  }
}
