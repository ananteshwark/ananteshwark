import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DoaService } from './doa.service';
import { CreateDoaRuleDto, UpdateDoaRuleDto } from './dto/doa.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('procurement-doa')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/doa')
export class DoaController {
  constructor(private readonly service: DoaService) {}

  @Get()
  @RequirePermission('procurement:po:read')
  @ApiOperation({ summary: 'List Delegation of Authority rules' })
  @ApiQuery({ name: 'documentType', required: false })
  list(@CurrentUser() user: any, @Query('documentType') documentType?: string) {
    return this.service.listRules(user.tenantId, documentType);
  }

  @Post()
  @RequirePermission('procurement:po:approve')
  @ApiOperation({ summary: 'Create a DoA rule' })
  create(@CurrentUser() user: any, @Body() dto: CreateDoaRuleDto) {
    return this.service.createRule(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('procurement:po:approve')
  @ApiOperation({ summary: 'Update a DoA rule' })
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateDoaRuleDto,
  ) {
    return this.service.updateRule(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission('procurement:po:approve')
  @ApiOperation({ summary: 'Deactivate a DoA rule' })
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteRule(user.tenantId, id);
  }
}
