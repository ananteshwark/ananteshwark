import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ServiceEntryService } from './service-entry.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreateServiceEntryDto, RejectServiceEntryDto } from './dto/service-entry.dto';
import { ServiceEntryStatus } from './entities/service-entry-sheet.entity';

@ApiTags('procurement-service-entries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/service-entries')
export class ServiceEntryController {
  constructor(private readonly service: ServiceEntryService) {}

  @Get()
  @RequirePermission('procurement:grn:read')
  @ApiOperation({ summary: 'List service entry sheets (filter by po/status)' })
  @ApiQuery({ name: 'poId', required: false })
  @ApiQuery({ name: 'status', required: false })
  list(
    @CurrentUser() user: any,
    @Query('poId') poId?: string,
    @Query('status') status?: ServiceEntryStatus,
  ) {
    return this.service.findAll(user.tenantId, { poId, status });
  }

  @Get(':id')
  @RequirePermission('procurement:grn:read')
  @ApiOperation({ summary: 'Get a service entry sheet by ID' })
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findOne(user.tenantId, id);
  }

  @Post()
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Create a service entry sheet against a service PO' })
  create(@CurrentUser() user: any, @Body() dto: CreateServiceEntryDto) {
    return this.service.create(user.tenantId, dto);
  }

  @Post(':id/submit')
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Submit a service entry sheet for approval' })
  submit(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.submit(user.tenantId, id);
  }

  @Post(':id/approve')
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Approve a service entry sheet (creates a GR entry for 3-way match)' })
  approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approve(user.tenantId, id, user.id);
  }

  @Post(':id/reject')
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Reject a service entry sheet' })
  reject(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: RejectServiceEntryDto,
  ) {
    return this.service.reject(user.tenantId, id, dto.reason);
  }
}
