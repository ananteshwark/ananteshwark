import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PositionService } from './position.service';

@ApiTags('hr-positions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('hr')
export class PositionController {
  constructor(private readonly positionService: PositionService) {}

  // Position endpoints
  @Get('positions')
  @ApiOperation({ summary: 'List positions' })
  listPositions(
    @CurrentUser() user: any,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.positionService.listPositions(user.tenantId, { departmentId, status, search });
  }

  @Post('positions')
  @ApiOperation({ summary: 'Create position' })
  createPosition(@CurrentUser() user: any, @Body() dto: any) {
    return this.positionService.createPosition(user.tenantId, dto);
  }

  @Patch('positions/:id')
  @ApiOperation({ summary: 'Update position' })
  updatePosition(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.positionService.updatePosition(user.tenantId, id, dto);
  }

  @Delete('positions/:id')
  @ApiOperation({ summary: 'Close position (soft delete)' })
  deletePosition(@CurrentUser() user: any, @Param('id') id: string) {
    return this.positionService.deletePosition(user.tenantId, id);
  }

  @Get('positions/headcount-dashboard')
  @ApiOperation({ summary: 'Headcount dashboard by department' })
  headcountDashboard(@CurrentUser() user: any) {
    return this.positionService.getHeadcountDashboard(user.tenantId);
  }

  @Get('positions/vacancies')
  @ApiOperation({ summary: 'List open vacancies' })
  vacancies(@CurrentUser() user: any) {
    return this.positionService.getVacanciesList(user.tenantId);
  }

  @Post('positions/:id/assign/:employeeId')
  @ApiOperation({ summary: 'Assign employee to position' })
  assignEmployee(
    @CurrentUser() user: any,
    @Param('id') positionId: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.positionService.assignEmployee(user.tenantId, positionId, employeeId);
  }

  @Post('positions/:id/unassign/:employeeId')
  @ApiOperation({ summary: 'Unassign employee from position' })
  unassignEmployee(
    @CurrentUser() user: any,
    @Param('id') positionId: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.positionService.unassignEmployee(user.tenantId, employeeId);
  }

  // Grade endpoints
  @Get('grades')
  @ApiOperation({ summary: 'List grades' })
  listGrades(@CurrentUser() user: any) {
    return this.positionService.listGrades(user.tenantId);
  }

  @Post('grades')
  @ApiOperation({ summary: 'Create grade' })
  createGrade(@CurrentUser() user: any, @Body() dto: any) {
    return this.positionService.createGrade(user.tenantId, dto);
  }

  @Patch('grades/:id')
  @ApiOperation({ summary: 'Update grade' })
  updateGrade(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.positionService.updateGrade(user.tenantId, id, dto);
  }
}
