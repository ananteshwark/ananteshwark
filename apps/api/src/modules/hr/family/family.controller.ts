import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FamilyService } from './family.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { NomineeForType } from './entities/nominee.entity';

@ApiTags('hr-family')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/employees/:employeeId')
export class FamilyController {
  constructor(private readonly service: FamilyService) {}

  // Dependents
  @Get('dependents')
  @RequirePermission('hr:employees:read')
  listDependents(
    @CurrentUser() user: any,
    @Param('employeeId') employeeId: string,
  ) {
    return this.service.listDependents(user.tenantId, employeeId);
  }

  @Post('dependents')
  @RequirePermission('hr:employees:update')
  addDependent(
    @CurrentUser() user: any,
    @Param('employeeId') employeeId: string,
    @Body()
    dto: {
      name: string;
      relationship: string;
      dateOfBirth?: string | null;
      gender?: string | null;
    },
  ) {
    return this.service.addDependent(user.tenantId, employeeId, dto);
  }

  @Delete('dependents/:id')
  @RequirePermission('hr:employees:update')
  deleteDependent(
    @CurrentUser() user: any,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    return this.service.deleteDependent(user.tenantId, employeeId, id);
  }

  // Nominees
  @Get('nominees')
  @RequirePermission('hr:employees:read')
  listNominees(
    @CurrentUser() user: any,
    @Param('employeeId') employeeId: string,
  ) {
    return this.service.listNominees(user.tenantId, employeeId);
  }

  @Post('nominees')
  @RequirePermission('hr:employees:update')
  addNominee(
    @CurrentUser() user: any,
    @Param('employeeId') employeeId: string,
    @Body()
    dto: {
      name: string;
      relationship: string;
      percentage: number;
      forType?: NomineeForType;
    },
  ) {
    return this.service.addNominee(user.tenantId, employeeId, dto);
  }

  @Delete('nominees/:id')
  @RequirePermission('hr:employees:update')
  deleteNominee(
    @CurrentUser() user: any,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
  ) {
    return this.service.deleteNominee(user.tenantId, employeeId, id);
  }
}
